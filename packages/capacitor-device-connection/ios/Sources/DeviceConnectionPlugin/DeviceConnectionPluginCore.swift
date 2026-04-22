import Foundation
import Network

/// TCP session + framed JSON protocol (matches Android `DeviceConnectionPlugin`).
public final class DeviceConnectionPluginCore: NSObject {
    private let appId = "synra"
    private let protocolVersion = "1.0"
    private let sessionAckTimeoutMs = 3000
    private let unifiedDeviceUuidDefaultsKey = "synra.preferences.synra.device.instance-uuid"
    private let deviceBasicInfoDefaultsKey = "synra.preferences.synra.device.basic-info"
    private let pairedDevicesDefaultsKey = "synra.preferences.synra.device.paired-peers"
    private let legacyDeviceDisplayNameDefaultsKey = "synra.preferences.synra.device.display-name"
    private let legacyDeviceUuidStorageKey = "synra.device-connection.device-uuid"

    private func pairedPeerDeviceIds(from helloAckPayload: [String: Any]?) -> [String] {
        guard let raw = helloAckPayload?["pairedPeerDeviceIds"] as? [Any] else {
            return []
        }
        return raw.compactMap { $0 as? String }.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter {
            !$0.isEmpty
        }
    }

    private func storedPairedPeerDeviceIds() -> [String] {
        guard let raw = UserDefaults.standard.string(forKey: pairedDevicesDefaultsKey), !raw.isEmpty else {
            return []
        }
        guard
            let data = raw.data(using: .utf8),
            let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let items = payload["items"] as? [[String: Any]]
        else {
            return []
        }
        return items.compactMap { item in
            guard let id = item["deviceId"] as? String else {
                return nil
            }
            let trimmed = id.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
    }

    private var sessionState = SessionState()
    private var connection: NWConnection?

    public var onMessageReceived: (([String: Any]) -> Void)?
    public var onMessageAck: (([String: Any]) -> Void)?
    public var onSessionClosed: (([String: Any]) -> Void)?
    public var onTransportError: (([String: Any]) -> Void)?

    public func openSession(
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

        if sessionState.state == "open", let replacedSessionId = sessionState.sessionId {
            onSessionClosed?([
                "sessionId": replacedSessionId,
                "reason": "replaced",
                "transport": "tcp",
            ])
        }

        closeSession(sessionId: nil)

        sessionState.state = "connecting"
        sessionState.deviceId = deviceId
        sessionState.host = host
        sessionState.port = Int(port.uint16Value)
        sessionState.lastError = nil

        let nwConnection = NWConnection(host: NWEndpoint.Host(host), port: endpointPort, using: .tcp)
        connection = nwConnection
        let semaphore = DispatchSemaphore(value: 0)
        var opened = false
        var openError: String?
        var capturedPairedPeerIds: [String] = []
        let claimsPeerPaired = storedPairedPeerDeviceIds().contains(deviceId)
        let generatedSessionId = UUID().uuidString

        let helloPayload: Any? = {
            var payload: [String: Any] = [
                "sourceDeviceId": localDeviceUuid(),
                "probe": false,
                "displayName": localSynraDisplayName(),
                "handshakeKind": claimsPeerPaired ? "paired" : "fresh",
                "claimsPeerPaired": claimsPeerPaired,
            ]
            if let token {
                payload["token"] = token
            }
            return payload
        }()

        nwConnection.stateUpdateHandler = { [weak self] state in
            guard let self else {
                return
            }
            switch state {
            case .ready:
                let frame = self.frame(
                    type: "hello",
                    sessionId: generatedSessionId,
                    messageId: nil,
                    payload: helloPayload
                )
                self.sendFrame(frame, through: nwConnection)
                self.receiveSingleFrame(through: nwConnection) { response in
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
                    if response["appId"] as? String != self.appId {
                        openError = "APP_ID_MISMATCH"
                        semaphore.signal()
                        return
                    }
                    let helloAckPayload = response["payload"] as? [String: Any]
                    let remoteDeviceId = helloAckPayload?["sourceDeviceId"] as? String
                    if remoteDeviceId?.isEmpty != false {
                        openError = "SOURCE_DEVICE_ID_REQUIRED"
                        semaphore.signal()
                        return
                    }
                    let ackDisplay = (helloAckPayload?["displayName"] as? String)?
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    let pairedPeerIds = self.pairedPeerDeviceIds(from: helloAckPayload)
                    self.sessionState.peerDisplayName =
                        (ackDisplay?.isEmpty == false) ? ackDisplay : nil
                    self.sessionState.state = "open"
                    self.sessionState.deviceId = remoteDeviceId
                    self.sessionState.sessionId = (response["sessionId"] as? String) ?? generatedSessionId
                    self.sessionState.openedAt = self.now()
                    opened = true
                    capturedPairedPeerIds = pairedPeerIds
                    self.startReceiveLoop(on: nwConnection)
                    semaphore.signal()
                }
            case .failed(let error):
                openError = error.localizedDescription
                semaphore.signal()
            default:
                break
            }
        }

        nwConnection.start(queue: .global(qos: .userInitiated))
        let timeout = DispatchTime.now() + .milliseconds(sessionAckTimeoutMs)
        if semaphore.wait(timeout: timeout) == .timedOut {
            openError = "SESSION_OPEN_TIMEOUT"
        }

        if opened {
            var payload: [String: Any] = [
                "success": true,
                "sessionId": sessionState.sessionId ?? generatedSessionId,
                "state": sessionState.state,
                "transport": "tcp",
                "pairedPeerDeviceIds": capturedPairedPeerIds,
                "handshakeKind": claimsPeerPaired ? "paired" : "fresh",
                "claimsPeerPaired": claimsPeerPaired,
            ]
            if let name = sessionState.peerDisplayName, !name.isEmpty {
                payload["displayName"] = name
            }
            return payload
        }

        sessionState.state = "error"
        sessionState.lastError = openError ?? "SESSION_OPEN_FAILED"
        nwConnection.cancel()
        connection = nil
        return nil
    }

    public func closeSession(sessionId: String?) -> [String: Any] {
        if let sid = sessionId ?? sessionState.sessionId {
            let closeFrame = frame(type: "close", sessionId: sid, messageId: nil, payload: nil)
            if let conn = connection {
                sendFrame(closeFrame, through: conn)
            }
        }
        connection?.cancel()
        connection = nil
        sessionState.state = "closed"
        sessionState.closedAt = now()
        return [
            "success": true,
            "sessionId": sessionId ?? sessionState.sessionId as Any,
            "transport": "tcp",
        ]
    }

    public func sendMessage(
        sessionId: String,
        messageType: String,
        payload: Any,
        messageId: String?
    ) -> [String: Any]? {
        guard sessionState.state == "open", let conn = connection else {
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
        sendFrame(messageFrame, through: conn)
        return [
            "success": true,
            "messageId": targetMessageId,
            "sessionId": sessionId,
            "transport": "tcp",
        ]
    }

    public func getSessionState(sessionId: String?) -> [String: Any] {
        if let sessionId, let currentSessionId = sessionState.sessionId, sessionId != currentSessionId {
            return [
                "sessionId": sessionId,
                "state": "closed",
                "transport": "tcp",
                "closedAt": now(),
                "lastError": "SESSION_NOT_FOUND",
            ]
        }

        var dict = sessionState.toDictionary()
        dict["transport"] = "tcp"
        return dict
    }

    private func now() -> Int {
        Int(Date().timeIntervalSince1970 * 1000)
    }

    private func localSynraDisplayName() -> String {
        resolvedDeviceName()
    }

    private func resolvedDeviceName() -> String {
        let defaults = UserDefaults.standard
        if let stored = defaults.string(forKey: deviceBasicInfoDefaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
            !stored.isEmpty,
            let parsed = parseBasicInfoDeviceName(from: stored)
        {
            return parsed
        }
        if let legacy = defaults.string(forKey: legacyDeviceDisplayNameDefaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
            !legacy.isEmpty
        {
            persistBasicInfoJson(deviceName: legacy, defaults: defaults)
            defaults.removeObject(forKey: legacyDeviceDisplayNameDefaultsKey)
            return legacy
        }
        let uuid = localDeviceUuid()
        let raw = uuid.replacingOccurrences(of: "-", with: "").lowercased()
        let derived = String(raw.prefix(6))
        let name = derived.isEmpty ? "device" : derived
        persistBasicInfoJson(deviceName: name, defaults: defaults)
        return name
    }

    private func parseBasicInfoDeviceName(from jsonString: String) -> String? {
        guard let data = jsonString.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let dn = obj["deviceName"] as? String
        else {
            return nil
        }
        let trimmed = dn.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func persistBasicInfoJson(deviceName: String, defaults: UserDefaults) {
        let payload: [String: Any] = ["deviceName": deviceName]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let str = String(data: data, encoding: .utf8)
        else {
            return
        }
        defaults.set(str, forKey: deviceBasicInfoDefaultsKey)
    }

    private func localDeviceUuid() -> String {
        let defaults = UserDefaults.standard
        if let existing = defaults.string(forKey: unifiedDeviceUuidDefaultsKey), !existing.isEmpty {
            return existing
        }
        if let legacy = defaults.string(forKey: legacyDeviceUuidStorageKey), !legacy.isEmpty {
            defaults.set(legacy, forKey: unifiedDeviceUuidDefaultsKey)
            defaults.removeObject(forKey: legacyDeviceUuidStorageKey)
            return legacy
        }
        let created = UUID().uuidString
        defaults.set(created, forKey: unifiedDeviceUuidDefaultsKey)
        return created
    }

    private func frame(type: String, sessionId: String, messageId: String?, payload: Any?) -> [String: Any] {
        var base: [String: Any] = [
            "version": protocolVersion,
            "type": type,
            "sessionId": sessionId,
            "timestamp": now(),
            "appId": appId,
            "protocolVersion": protocolVersion,
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

    private func sendFrame(_ frame: [String: Any], through target: NWConnection) {
        guard let payload = try? JSONSerialization.data(withJSONObject: frame) else {
            return
        }
        var length = UInt32(payload.count).bigEndian
        let header = Data(bytes: &length, count: MemoryLayout<UInt32>.size)
        let packet = header + payload
        target.send(content: packet, completion: .contentProcessed({ _ in }))
    }

    private func receiveSingleFrame(
        through target: NWConnection,
        completion: @escaping ([String: Any]?) -> Void
    ) {
        target.receive(minimumIncompleteLength: 4, maximumLength: 4) { header, _, _, _ in
            guard let header, header.count == 4 else {
                completion(nil)
                return
            }

            let length = header.withUnsafeBytes { pointer -> UInt32 in
                pointer.load(as: UInt32.self).bigEndian
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

    private func startReceiveLoop(on target: NWConnection) {
        receiveSingleFrame(through: target) { [weak self] frame in
            guard let self else {
                return
            }
            guard let frame else {
                self.sessionState.state = "closed"
                self.sessionState.closedAt = self.now()
                self.connection?.cancel()
                self.connection = nil
                return
            }

            if frame["type"] as? String == "close" {
                self.sessionState.state = "closed"
                self.sessionState.closedAt = self.now()
                self.connection?.cancel()
                self.connection = nil
                self.onSessionClosed?([
                    "sessionId": frame["sessionId"] as Any,
                    "reason": "peer-closed",
                    "transport": "tcp",
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
                    "transport": "tcp",
                ])
            } else if frame["type"] as? String == "ack" {
                self.onMessageAck?([
                    "sessionId": frame["sessionId"] as Any,
                    "messageId": frame["messageId"] as Any,
                    "timestamp": frame["timestamp"] as? Int ?? self.now(),
                    "transport": "tcp",
                ])
            } else if frame["type"] as? String == "error" {
                self.onTransportError?([
                    "sessionId": frame["sessionId"] as Any,
                    "code": "TRANSPORT_IO_ERROR",
                    "message": frame["error"] as? String ?? "Unknown transport error",
                    "transport": "tcp",
                ])
            }
            self.startReceiveLoop(on: target)
        }
    }
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
    var peerDisplayName: String?

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
            "displayName": peerDisplayName as Any,
        ]
    }
}
