import Foundation
import CryptoKit
import Network

@objc public class LanDiscoveryPlugin: NSObject {
    private let defaultScanWindowMs = 15_000
    private var state: String = "idle"
    private var startedAt: Int?
    private var scanWindowMs: Int = 15_000
    private var devices: [String: DeviceRecord] = [:]
    private var sessionState = SessionState()
    private var connection: NWConnection?
    public var onMessageReceived: (([String: Any]) -> Void)?
    public var onMessageAck: (([String: Any]) -> Void)?
    public var onSessionClosed: (([String: Any]) -> Void)?
    public var onTransportError: (([String: Any]) -> Void)?

    @objc public func startDiscovery(
        includeLoopback: Bool,
        manualTargets: [String],
        enableProbeFallback: Bool,
        reset: Bool,
        scanWindowMs: NSNumber?
    ) -> [String: Any] {
        if reset {
            devices.removeAll()
        }

        state = "scanning"
        startedAt = now()
        self.scanWindowMs = scanWindowMs?.intValue ?? defaultScanWindowMs

        let interfaceDevices = collectInterfaceDevices(includeLoopback: includeLoopback)
        mergeDevices(interfaceDevices)
        mergeDevices(collectManualDevices(manualTargets))

        if enableProbeFallback {
            mergeDevices(collectProbeCandidates(seedDevices: interfaceDevices))
        }

        var result = listDevices()
        result["requestId"] = UUID().uuidString
        return result
    }

    @objc public func stopDiscovery() -> [String: Any] {
        state = "idle"
        return ["success": true]
    }

    @objc public func listDevices() -> [String: Any] {
        var result: [String: Any] = [
            "state": state,
            "scanWindowMs": scanWindowMs,
            "devices": devices.values.map { $0.toDictionary() },
        ]
        if let startedAt {
            result["startedAt"] = startedAt
        }
        return result
    }

    @objc public func pairDevice(deviceId: String) -> [String: Any]? {
        guard let selected = devices[deviceId] else {
            return nil
        }

        let paired = selected.withPaired(true)
        devices[deviceId] = paired
        return [
            "success": true,
            "device": paired.toDictionary(),
        ]
    }

    @objc public func updateDeviceConnectable(
        deviceId: String,
        connectable: Bool,
        connectCheckError: String?
    ) -> [String: Any]? {
        guard let selected = devices[deviceId] else {
            return nil
        }
        let updated = selected.withConnectable(connectable, connectCheckError)
        devices[deviceId] = updated
        return updated.toDictionary()
    }

    @objc public func probeConnectable(port: NSNumber?, timeoutMs: NSNumber?) -> [String: Any] {
        let targetPort = port?.uint16Value ?? 32100
        let targetTimeout = timeoutMs?.intValue ?? 1500
        let checkedAt = now()
        for (deviceId, device) in devices {
            let outcome = probeDevice(host: device.ipAddress, port: targetPort, timeoutMs: targetTimeout)
            let updated = device.withConnectable(outcome.connectable, outcome.error)
            devices[deviceId] = updated
        }

        return [
            "checkedAt": checkedAt,
            "port": Int(targetPort),
            "timeoutMs": targetTimeout,
            "devices": devices.values.map { $0.toDictionary() },
        ]
    }

    @objc public func openSession(
        deviceId: String,
        host: String,
        port: NSNumber,
        token: String?
    ) -> [String: Any]? {
        let tcpPort = NWEndpoint.Port(rawValue: port.uint16Value)
        guard let endpointPort = tcpPort else {
            sessionState.state = "error"
            sessionState.lastError = "INVALID_PORT"
            return nil
        }

        closeSession(sessionId: nil)

        sessionState.state = "connecting"
        sessionState.deviceId = deviceId
        sessionState.host = host
        sessionState.port = Int(port.uint16Value)
        sessionState.lastError = nil

        let connection = NWConnection(host: NWEndpoint.Host(host), port: endpointPort, using: .tcp)
        self.connection = connection
        let semaphore = DispatchSemaphore(value: 0)
        var opened = false
        var openError: String?
        let generatedSessionId = UUID().uuidString

        connection.stateUpdateHandler = { [weak self] state in
            guard let self else {
                return
            }
            switch state {
            case .ready:
                let frame = self.frame(
                    type: "hello",
                    sessionId: generatedSessionId,
                    messageId: nil,
                    payload: ["token": token as Any]
                )
                self.sendFrame(frame)
                self.receiveSingleFrame { response in
                    guard let response else {
                        openError = "MISSING_HELLO_ACK"
                        semaphore.signal()
                        return
                    }
                    if response["type"] as? String != "helloAck" {
                        openError = "MISSING_HELLO_ACK"
                        semaphore.signal()
                        return
                    }
                    if response["appId"] as? String != "synra" {
                        openError = "APP_ID_MISMATCH"
                        semaphore.signal()
                        return
                    }
                    self.sessionState.state = "open"
                    self.sessionState.sessionId = (response["sessionId"] as? String) ?? generatedSessionId
                    self.sessionState.openedAt = self.now()
                    opened = true
                    self.startReceiveLoop()
                    semaphore.signal()
                }
            case .failed(let error):
                openError = error.localizedDescription
                semaphore.signal()
            default:
                break
            }
        }

        connection.start(queue: .global(qos: .userInitiated))
        let timeout = DispatchTime.now() + .milliseconds(3000)
        if semaphore.wait(timeout: timeout) == .timedOut {
            openError = "SESSION_OPEN_TIMEOUT"
        }

        if opened {
            return [
                "success": true,
                "sessionId": sessionState.sessionId ?? generatedSessionId,
                "state": sessionState.state,
            ]
        }

        sessionState.state = "error"
        sessionState.lastError = openError ?? "SESSION_OPEN_FAILED"
        connection.cancel()
        self.connection = nil
        return nil
    }

    @objc public func closeSession(sessionId: String?) -> [String: Any] {
        if let sessionId = sessionId ?? sessionState.sessionId {
            let closeFrame = frame(type: "close", sessionId: sessionId, messageId: nil, payload: nil)
            sendFrame(closeFrame)
        }
        connection?.cancel()
        connection = nil
        sessionState.state = "closed"
        sessionState.closedAt = now()
        return [
            "success": true,
            "sessionId": sessionId ?? sessionState.sessionId as Any,
        ]
    }

    @objc public func sendMessage(
        sessionId: String,
        messageType: String,
        payload: Any,
        messageId: String?
    ) -> [String: Any]? {
        guard sessionState.state == "open" else {
            sessionState.lastError = "SESSION_NOT_OPEN"
            return nil
        }

        let targetMessageId = messageId ?? UUID().uuidString
        let envelope: [String: Any] = [
            "messageType": messageType,
            "payload": payload,
        ]
        let messageFrame = frame(
            type: "message",
            sessionId: sessionId,
            messageId: targetMessageId,
            payload: envelope
        )
        sendFrame(messageFrame)
        return [
            "success": true,
            "messageId": targetMessageId,
            "sessionId": sessionId,
        ]
    }

    @objc public func getSessionState(sessionId: String?) -> [String: Any] {
        if let sessionId, let currentSessionId = sessionState.sessionId, sessionId != currentSessionId {
            return [
                "sessionId": sessionId,
                "state": "closed",
                "closedAt": now(),
                "lastError": "SESSION_NOT_FOUND",
            ]
        }

        return sessionState.toDictionary()
    }

    private func mergeDevices(_ incoming: [DeviceRecord]) {
        for device in incoming {
            if let existing = devices[device.deviceId] {
                devices[device.deviceId] = existing.merge(with: device)
            } else {
                devices[device.deviceId] = device
            }
        }
    }

    private func collectInterfaceDevices(includeLoopback: Bool) -> [DeviceRecord] {
        guard includeLoopback else {
            return []
        }

        let host = Host.current().localizedName ?? "ios-host"
        let address = "127.0.0.1"
        return [
            DeviceRecord(
                deviceId: hashDeviceId("loopback:\(address)"),
                name: "\(host) (loopback)",
                ipAddress: address,
                source: "mdns",
                paired: false,
                connectable: false,
                connectCheckAt: nil,
                connectCheckError: nil,
                discoveredAt: now(),
                lastSeenAt: now()
            ),
        ]
    }

    private func collectManualDevices(_ manualTargets: [String]) -> [DeviceRecord] {
        var result: [DeviceRecord] = []
        var index = 1
        for target in manualTargets {
            let trimmed = target.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty {
                continue
            }

            result.append(DeviceRecord(
                deviceId: hashDeviceId("manual:\(trimmed)"),
                name: "Manual Target \(index)",
                ipAddress: trimmed,
                source: "manual",
                paired: false,
                connectable: false,
                connectCheckAt: nil,
                connectCheckError: nil,
                discoveredAt: now(),
                lastSeenAt: now()
            ))
            index += 1
        }
        return result
    }

    private func collectProbeCandidates(seedDevices: [DeviceRecord]) -> [DeviceRecord] {
        guard let first = seedDevices.first else {
            return []
        }

        let octets = first.ipAddress.split(separator: ".")
        guard octets.count == 4, let tail = Int(octets[3]) else {
            return []
        }

        let probeTail = tail >= 254 ? 1 : tail + 1
        let probeIp = "\(octets[0]).\(octets[1]).\(octets[2]).\(probeTail)"

        return [
            DeviceRecord(
                deviceId: hashDeviceId("probe:\(probeIp)"),
                name: "Probe Candidate",
                ipAddress: probeIp,
                source: "probe",
                paired: false,
                connectable: false,
                connectCheckAt: nil,
                connectCheckError: nil,
                discoveredAt: now(),
                lastSeenAt: now()
            ),
        ]
    }

    private func now() -> Int {
        Int(Date().timeIntervalSince1970 * 1000)
    }

    private func hashDeviceId(_ value: String) -> String {
        let digest = Insecure.SHA1.hash(data: Data(value.utf8))
        let prefix = digest.map { String(format: "%02x", $0) }.joined().prefix(12)
        return "device-\(prefix)"
    }

    private func probeDevice(host: String, port: UInt16, timeoutMs: Int) -> ProbeOutcome {
        guard let endpointPort = NWEndpoint.Port(rawValue: port) else {
            return ProbeOutcome(connectable: false, error: "INVALID_PORT")
        }

        let connection = NWConnection(host: NWEndpoint.Host(host), port: endpointPort, using: .tcp)
        let semaphore = DispatchSemaphore(value: 0)
        var outcome = ProbeOutcome(connectable: false, error: "PROBE_FAILED")
        connection.stateUpdateHandler = { [weak self] state in
            guard let self else {
                semaphore.signal()
                return
            }
            switch state {
            case .ready:
                self.sendFrame(
                    self.frame(
                        type: "hello",
                        sessionId: UUID().uuidString,
                        messageId: nil,
                        payload: nil
                    ),
                    through: connection
                )
                self.receiveSingleFrame(through: connection) { frame in
                    if let frame, frame["type"] as? String == "helloAck", frame["appId"] as? String == "synra" {
                        outcome = ProbeOutcome(connectable: true, error: nil)
                    } else {
                        outcome = ProbeOutcome(connectable: false, error: "HELLO_ACK_INVALID")
                    }
                    semaphore.signal()
                }
            case .failed(let error):
                outcome = ProbeOutcome(connectable: false, error: error.localizedDescription)
                semaphore.signal()
            default:
                break
            }
        }
        connection.start(queue: .global(qos: .userInitiated))
        _ = semaphore.wait(timeout: .now() + .milliseconds(timeoutMs))
        connection.cancel()
        if outcome.connectable {
            return outcome
        }
        if outcome.error == "PROBE_FAILED" {
            return ProbeOutcome(connectable: false, error: "PROBE_TIMEOUT")
        }
        return outcome
    }

    private func frame(type: String, sessionId: String, messageId: String?, payload: Any?) -> [String: Any] {
        var base: [String: Any] = [
            "version": "1.0",
            "type": type,
            "sessionId": sessionId,
            "timestamp": now(),
            "appId": "synra",
            "protocolVersion": "1.0",
            "capabilities": ["message"],
        ]
        if let messageId {
            base["messageId"] = messageId
        }
        if let payload {
            base["payload"] = payload
        }
        return base
    }

    private func sendFrame(_ frame: [String: Any], through connection: NWConnection? = nil) {
        let target = connection ?? self.connection
        guard let target else {
            return
        }
        guard let payload = try? JSONSerialization.data(withJSONObject: frame) else {
            return
        }
        var length = UInt32(payload.count).bigEndian
        let header = Data(bytes: &length, count: MemoryLayout<UInt32>.size)
        let packet = header + payload
        target.send(content: packet, completion: .contentProcessed({ _ in }))
    }

    private func receiveSingleFrame(
        through connection: NWConnection? = nil,
        completion: @escaping ([String: Any]?) -> Void
    ) {
        let target = connection ?? self.connection
        guard let target else {
            completion(nil)
            return
        }
        target.receive(minimumIncompleteLength: 4, maximumLength: 4) { header, _, _, _ in
            guard
                let header,
                header.count == 4
            else {
                completion(nil)
                return
            }

            let length = header.withUnsafeBytes { pointer -> UInt32 in
                return pointer.load(as: UInt32.self).bigEndian
            }

            target.receive(minimumIncompleteLength: Int(length), maximumLength: Int(length)) {
                payload, _, _, _ in
                guard
                    let payload,
                    let object = try? JSONSerialization.jsonObject(with: payload) as? [String: Any]
                else {
                    completion(nil)
                    return
                }
                completion(object)
            }
        }
    }

    private func startReceiveLoop() {
        receiveSingleFrame { [weak self] frame in
            guard let self else {
                return
            }
            guard let frame else {
                self.sessionState.state = "closed"
                self.sessionState.closedAt = self.now()
                return
            }

            if frame["type"] as? String == "close" {
                self.sessionState.state = "closed"
                self.sessionState.closedAt = self.now()
                self.onSessionClosed?([
                    "sessionId": frame["sessionId"] as Any,
                    "reason": "peer-closed",
                ])
                return
            }
            if frame["type"] as? String == "message" {
                let payload = frame["payload"] as? [String: Any]
                self.onMessageReceived?([
                    "sessionId": frame["sessionId"] as Any,
                    "messageId": frame["messageId"] as Any,
                    "messageType": payload?["messageType"] as? String ?? "transport.message.received",
                    "payload": payload?["payload"] as Any,
                    "timestamp": frame["timestamp"] as? Int ?? self.now(),
                ])
            } else if frame["type"] as? String == "ack" {
                self.onMessageAck?([
                    "sessionId": frame["sessionId"] as Any,
                    "messageId": frame["messageId"] as Any,
                    "timestamp": frame["timestamp"] as? Int ?? self.now(),
                ])
            } else if frame["type"] as? String == "error" {
                self.onTransportError?([
                    "sessionId": frame["sessionId"] as Any,
                    "code": "TRANSPORT_IO_ERROR",
                    "message": frame["error"] as? String ?? "Unknown transport error",
                ])
            }
            self.startReceiveLoop()
        }
    }
}

private struct DeviceRecord {
    let deviceId: String
    let name: String
    let ipAddress: String
    let source: String
    let paired: Bool
    let connectable: Bool
    let connectCheckAt: Int?
    let connectCheckError: String?
    let discoveredAt: Int
    let lastSeenAt: Int

    func merge(with incoming: DeviceRecord) -> DeviceRecord {
        DeviceRecord(
            deviceId: deviceId,
            name: incoming.name,
            ipAddress: incoming.ipAddress,
            source: incoming.source,
            paired: paired || incoming.paired,
            connectable: incoming.connectable,
            connectCheckAt: incoming.connectCheckAt,
            connectCheckError: incoming.connectCheckError,
            discoveredAt: discoveredAt,
            lastSeenAt: Int(Date().timeIntervalSince1970 * 1000)
        )
    }

    func withPaired(_ value: Bool) -> DeviceRecord {
        DeviceRecord(
            deviceId: deviceId,
            name: name,
            ipAddress: ipAddress,
            source: source,
            paired: value,
            connectable: connectable,
            connectCheckAt: connectCheckAt,
            connectCheckError: connectCheckError,
            discoveredAt: discoveredAt,
            lastSeenAt: Int(Date().timeIntervalSince1970 * 1000)
        )
    }

    func withConnectable(_ value: Bool, _ error: String?) -> DeviceRecord {
        DeviceRecord(
            deviceId: deviceId,
            name: name,
            ipAddress: ipAddress,
            source: source,
            paired: paired,
            connectable: value,
            connectCheckAt: Int(Date().timeIntervalSince1970 * 1000),
            connectCheckError: error,
            discoveredAt: discoveredAt,
            lastSeenAt: Int(Date().timeIntervalSince1970 * 1000)
        )
    }

    func toDictionary() -> [String: Any] {
        [
            "deviceId": deviceId,
            "name": name,
            "ipAddress": ipAddress,
            "source": source,
            "paired": paired,
            "connectable": connectable,
            "connectCheckAt": connectCheckAt as Any,
            "connectCheckError": connectCheckError as Any,
            "discoveredAt": discoveredAt,
            "lastSeenAt": lastSeenAt,
        ]
    }
}

private struct ProbeOutcome {
    let connectable: Bool
    let error: String?
}

private struct SessionState {
    var sessionId: String?
    var deviceId: String?
    var host: String?
    var port: Int?
    var state: String = "idle"
    var lastError: String?
    var openedAt: Int?
    var closedAt: Int?

    func toDictionary() -> [String: Any] {
        [
            "sessionId": sessionId as Any,
            "deviceId": deviceId as Any,
            "host": host as Any,
            "port": port as Any,
            "state": state,
            "lastError": lastError as Any,
            "openedAt": openedAt as Any,
            "closedAt": closedAt as Any,
        ]
    }
}
