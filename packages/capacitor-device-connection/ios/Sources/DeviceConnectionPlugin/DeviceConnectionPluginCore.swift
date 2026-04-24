import CryptoKit
import Darwin
import Foundation
import Network

/// TCP session + framed JSON protocol (matches Android `DeviceConnectionPlugin`).
public final class DeviceConnectionPluginCore: NSObject {
    internal let appId = "synra"
    internal let protocolVersion = "1.0"
    private let sessionAckTimeoutMs = 6000
    private let unifiedDeviceUuidDefaultsKey = "synra.preferences.synra.device.instance-uuid"
    private let deviceBasicInfoDefaultsKey = "synra.preferences.synra.device.basic-info"
    private let legacyDeviceDisplayNameDefaultsKey = "synra.preferences.synra.device.display-name"
    private let legacyDeviceUuidStorageKey = "synra.device-connection.device-uuid"

    private var sessionState = SessionState()
    private var connection: NWConnection?

    public var onMessageReceived: (([String: Any]) -> Void)?
    public var onMessageAck: (([String: Any]) -> Void)?
    public var onLanWireEventReceived: (([String: Any]) -> Void)?
    public var onSessionOpened: (([String: Any]) -> Void)?
    public var onSessionClosed: (([String: Any]) -> Void)?
    public var onTransportError: (([String: Any]) -> Void)?

    internal let synraDefaultTcpPort: UInt16 = 32100
    internal let tcpServerQueue = DispatchQueue(label: "com.synra.device-connection.tcp-server")
    internal var tcpListener: NWListener?
    internal var inboundConnections: [String: SynraInboundConnectionContext] = [:]

    public func openSession(
        deviceId: String,
        host: String,
        port: NSNumber,
        token: String?,
        connectType: String
    ) -> [String: Any]? {
        let tcpPort = NWEndpoint.Port(rawValue: port.uint16Value)
        guard let endpointPort = tcpPort else {
            sessionState.state = "error"
            sessionState.lastError = "INVALID_PORT"
            return nil
        }

        if sessionState.state == "open" {
            onSessionClosed?([
                "deviceId": sessionState.deviceId as Any,
                "reason": "replaced",
                "transport": "tcp",
            ])
        }

        closeSession(targetDeviceId: nil)

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
        var lastConnectAckPayload: [String: Any]?
        let connectRequestId = UUID().uuidString

        let connectPayload: Any? = {
            var payload: [String: Any] = [
                "sourceDeviceId": localDeviceUuid(),
                "probe": false,
                "displayName": localSynraDisplayName(),
            ]
            if let token {
                payload["token"] = token
            }
            payload["connectType"] = connectType.trimmingCharacters(in: .whitespacesAndNewlines)
            return payload
        }()

        nwConnection.stateUpdateHandler = { [weak self] state in
            guard let self else {
                return
            }
            switch state {
            case .ready:
                let frame = self.synraLanFrame(
                    type: "connect",
                    requestId: connectRequestId,
                    messageId: nil,
                    sourceDeviceId: self.localDeviceUuid(),
                    targetDeviceId: deviceId.trimmingCharacters(in: .whitespacesAndNewlines),
                    replyToRequestId: nil,
                    payload: connectPayload,
                    error: nil
                )
                self.sendFrame(frame, through: nwConnection)
                self.receiveSingleFrame(through: nwConnection) { response in
                    guard let response else {
                        openError = "MISSING_CONNECT_ACK"
                        semaphore.signal()
                        return
                    }
                    if response["type"] as? String != "connectAck" {
                        openError = "MISSING_CONNECT_ACK"
                        semaphore.signal()
                        return
                    }
                    if response["appId"] as? String != self.appId {
                        openError = "APP_ID_MISMATCH"
                        semaphore.signal()
                        return
                    }
                    let ackPayload = response["payload"] as? [String: Any]
                    lastConnectAckPayload = ackPayload
                    let remoteDeviceId = ackPayload?["sourceDeviceId"] as? String
                    if remoteDeviceId?.isEmpty != false {
                        openError = "SOURCE_DEVICE_ID_REQUIRED"
                        semaphore.signal()
                        return
                    }
                    let ackDisplay = (ackPayload?["displayName"] as? String)?
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    self.sessionState.peerDisplayName =
                        (ackDisplay?.isEmpty == false) ? ackDisplay : nil
                    self.sessionState.state = "open"
                    self.sessionState.deviceId = remoteDeviceId
                    self.sessionState.openedAt = self.now()
                    opened = true
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
                "deviceId": sessionState.deviceId as Any,
                "state": sessionState.state,
                "transport": "tcp",
            ]
            if let name = sessionState.peerDisplayName, !name.isEmpty {
                payload["displayName"] = name
            }
            if let lastConnectAckPayload {
                payload["connectAckPayload"] = lastConnectAckPayload
            }
            return payload
        }

        sessionState.state = "error"
        sessionState.lastError = openError ?? "SESSION_OPEN_FAILED"
        nwConnection.cancel()
        connection = nil
        return nil
    }

    public func closeSession(targetDeviceId: String?) -> [String: Any] {
        if let targetDeviceId,
           let inboundEntry = inboundConnections.first(where: { $0.value.canonicalDeviceId == targetDeviceId })
        {
            closeSynraInboundConnection(
                connectionId: inboundEntry.key,
                reason: "closed-by-client",
                emitSessionClosed: true
            )
            return [
                "success": true,
                "targetDeviceId": targetDeviceId as Any,
                "transport": "tcp",
            ]
        }
        if sessionState.state == "open", let remoteId = sessionState.deviceId, let conn = connection {
            let closeFrame = synraLanFrame(
                type: "close",
                requestId: UUID().uuidString,
                messageId: nil,
                sourceDeviceId: localDeviceUuid(),
                targetDeviceId: remoteId,
                replyToRequestId: nil,
                payload: nil,
                error: nil
            )
            sendFrame(closeFrame, through: conn)
        }
        connection?.cancel()
        connection = nil
        sessionState.state = "closed"
        sessionState.closedAt = now()
        return [
            "success": true,
            "targetDeviceId": targetDeviceId as Any,
            "transport": "tcp",
        ]
    }

    public func sendMessage(
        requestId: String,
        sourceDeviceId: String,
        targetDeviceId: String,
        replyToRequestId: String?,
        messageType: String,
        payload: Any,
        messageId: String?
    ) -> [String: Any]? {
        let targetMessageId = messageId ?? UUID().uuidString
        let innerPayload: [String: Any] = [
            "messageType": messageType,
            "payload": payload,
        ]
        let messageFrame = synraLanFrame(
            type: "message",
            requestId: requestId,
            messageId: targetMessageId,
            sourceDeviceId: sourceDeviceId,
            targetDeviceId: targetDeviceId,
            replyToRequestId: replyToRequestId,
            payload: innerPayload,
            error: nil
        )
        if let inbound = inboundConnections.first(where: { $0.value.canonicalDeviceId == targetDeviceId })?.value {
            sendFrame(messageFrame, through: inbound.connection)
            return [
                "success": true,
                "messageId": targetMessageId,
                "targetDeviceId": targetDeviceId,
                "transport": "tcp",
            ]
        }
        guard sessionState.state == "open", let conn = connection else {
            sessionState.lastError = "SESSION_NOT_OPEN"
            return nil
        }

        sendFrame(messageFrame, through: conn)
        return [
            "success": true,
            "messageId": targetMessageId,
            "targetDeviceId": targetDeviceId,
            "transport": "tcp",
        ]
    }

    public func sendLanEvent(
        requestId: String,
        sourceDeviceId: String,
        targetDeviceId: String,
        replyToRequestId: String?,
        eventName: String,
        payload: Any?,
        eventId: String?,
        schemaVersion: Int?
    ) -> [String: Any]? {
        var innerPayload: [String: Any] = [
            "eventName": eventName,
        ]
        if let payload {
            innerPayload["payload"] = payload
        }
        if let eventId, !eventId.isEmpty {
            innerPayload["eventId"] = eventId
        }
        if let schemaVersion {
            innerPayload["schemaVersion"] = schemaVersion
        }
        let eventFrame = synraLanFrame(
            type: "event",
            requestId: requestId,
            messageId: nil,
            sourceDeviceId: sourceDeviceId,
            targetDeviceId: targetDeviceId,
            replyToRequestId: replyToRequestId,
            payload: innerPayload,
            error: nil
        )
        if let inbound = inboundConnections.first(where: { $0.value.canonicalDeviceId == targetDeviceId })?.value {
            sendFrame(eventFrame, through: inbound.connection)
            return [
                "success": true,
                "targetDeviceId": targetDeviceId,
                "transport": "tcp",
            ]
        }
        guard sessionState.state == "open", let conn = connection else {
            sessionState.lastError = "SESSION_NOT_OPEN"
            return nil
        }

        sendFrame(eventFrame, through: conn)
        return [
            "success": true,
            "targetDeviceId": targetDeviceId,
            "transport": "tcp",
        ]
    }

    public func getSessionState(targetDeviceId: String?) -> [String: Any] {
        if let targetDeviceId, let currentDeviceId = sessionState.deviceId, targetDeviceId != currentDeviceId {
            return [
                "deviceId": targetDeviceId,
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

    internal func now() -> Int {
        Int(Date().timeIntervalSince1970 * 1000)
    }

    internal func localSynraDisplayName() -> String {
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

    internal func localDeviceUuid() -> String {
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

    internal func hashSynraDeviceId(_ value: String) -> String {
        let digest = Insecure.SHA1.hash(data: Data(value.utf8))
        let prefix = digest.map { String(format: "%02x", $0) }.joined().prefix(12)
        return "device-\(prefix)"
    }

    internal func canonicalSynraDeviceId(fromWireSourceDeviceId raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return trimmed
        }
        if trimmed.hasPrefix("device-"), trimmed.count >= "device-".count + 8 {
            return trimmed
        }
        return hashSynraDeviceId(trimmed)
    }

    internal func fallbackPeerDisplayName(forCanonicalDeviceId id: String) -> String {
        let trimmed = id.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return "Synra device"
        }
        let tail = trimmed.hasPrefix("device-") ? String(trimmed.dropFirst("device-".count)) : trimmed
        let prefix = String(tail.prefix(6))
        return prefix.isEmpty ? "Synra device" : "Peer \(prefix)"
    }

    internal func primarySourceHostIpv4() -> String? {
        var cursor: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&cursor) == 0, let first = cursor else {
            return nil
        }
        defer { freeifaddrs(cursor) }
        var ips: [String] = []
        var pointer: UnsafeMutablePointer<ifaddrs>? = first
        while let current = pointer {
            let interface = current.pointee
            pointer = interface.ifa_next
            guard let address = interface.ifa_addr, address.pointee.sa_family == UInt8(AF_INET) else {
                continue
            }
            let addressValue = withUnsafePointer(to: address.pointee) {
                $0.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { rebound -> String in
                    var addr = rebound.pointee.sin_addr
                    var buffer = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
                    _ = inet_ntop(AF_INET, &addr, &buffer, socklen_t(INET_ADDRSTRLEN))
                    return String(cString: buffer)
                }
            }
            if addressValue != "127.0.0.1", !addressValue.hasPrefix("169.254.") {
                ips.append(addressValue)
            }
        }
        return ips.sorted().first
    }

    internal func synraLanFrame(
        type: String,
        requestId: String,
        messageId: String?,
        sourceDeviceId: String?,
        targetDeviceId: String?,
        replyToRequestId: String?,
        payload: Any?,
        error: String?
    ) -> [String: Any] {
        var base: [String: Any] = [
            "version": protocolVersion,
            "type": type,
            "requestId": requestId,
            "timestamp": now(),
            "appId": appId,
            "protocolVersion": protocolVersion,
            "capabilities": ["message", "event"],
        ]
        if let messageId {
            base["messageId"] = messageId
        }
        if let sourceDeviceId, !sourceDeviceId.isEmpty {
            base["sourceDeviceId"] = sourceDeviceId
        }
        if let targetDeviceId, !targetDeviceId.isEmpty {
            base["targetDeviceId"] = targetDeviceId
        }
        if let replyToRequestId, !replyToRequestId.isEmpty {
            base["replyToRequestId"] = replyToRequestId
        }
        if let payload {
            base["payload"] = payload
        }
        if let error, !error.isEmpty {
            base["error"] = error
        }
        return base
    }

    internal func sendFrame(
        _ frame: [String: Any],
        through target: NWConnection,
        onSent: (() -> Void)? = nil
    ) {
        guard let payload = try? JSONSerialization.data(withJSONObject: frame) else {
            onSent?()
            return
        }
        var length = UInt32(payload.count).bigEndian
        let header = Data(bytes: &length, count: MemoryLayout<UInt32>.size)
        let packet = header + payload
        target.send(content: packet, completion: .contentProcessed({ _ in
            onSent?()
        }))
    }

    internal func receiveSingleFrame(
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
                let shouldNotifyClosed = self.sessionState.state == "open"
                self.sessionState.state = "closed"
                self.sessionState.closedAt = self.now()
                self.connection?.cancel()
                self.connection = nil
                if shouldNotifyClosed {
                    self.onSessionClosed?([
                        "deviceId": self.sessionState.deviceId as Any,
                        "reason": "socket-closed",
                        "transport": "tcp",
                    ])
                }
                return
            }

            if frame["type"] as? String == "close" {
                self.sessionState.state = "closed"
                self.sessionState.closedAt = self.now()
                self.connection?.cancel()
                self.connection = nil
                self.onSessionClosed?([
                    "deviceId": self.sessionState.deviceId as Any,
                    "reason": "peer-closed",
                    "transport": "tcp",
                ])
                return
            }
            if frame["type"] as? String == "message" {
                let payload = frame["payload"] as? [String: Any]
                let topRequestId = frame["requestId"] as? String
                self.onMessageReceived?([
                    "requestId": (topRequestId ?? payload?["requestId"]) as Any,
                    "sourceDeviceId": (frame["sourceDeviceId"] as? String ?? payload?["sourceDeviceId"]) as Any,
                    "targetDeviceId": (frame["targetDeviceId"] as? String ?? payload?["targetDeviceId"]) as Any,
                    "replyToRequestId": (frame["replyToRequestId"] as? String ?? payload?["replyToRequestId"]) as Any,
                    "messageId": frame["messageId"] as Any,
                    "messageType": payload?["messageType"] as? String ?? "transport.message.received",
                    "payload": payload?["payload"] as Any,
                    "timestamp": frame["timestamp"] as? Int ?? self.now(),
                    "transport": "tcp",
                ])
            } else if frame["type"] as? String == "ack" {
                self.onMessageAck?([
                    "targetDeviceId": frame["targetDeviceId"] as Any ?? self.sessionState.deviceId as Any,
                    "requestId": frame["requestId"] as Any,
                    "messageId": frame["messageId"] as Any,
                    "timestamp": frame["timestamp"] as? Int ?? self.now(),
                    "transport": "tcp",
                ])
            } else if frame["type"] as? String == "event" {
                let pl = frame["payload"] as? [String: Any]
                let name = pl?["eventName"] as? String ?? ""
                let topRid = frame["requestId"] as? String
                self.onLanWireEventReceived?([
                    "requestId": (topRid ?? pl?["requestId"]) as Any,
                    "sourceDeviceId": (frame["sourceDeviceId"] as? String ?? pl?["sourceDeviceId"]) as Any,
                    "targetDeviceId": (frame["targetDeviceId"] as? String ?? pl?["targetDeviceId"]) as Any,
                    "replyToRequestId": (frame["replyToRequestId"] as? String ?? pl?["replyToRequestId"]) as Any,
                    "eventName": name,
                    "eventPayload": pl?["payload"] as Any,
                    "transport": "tcp",
                ])
            } else if frame["type"] as? String == "error" {
                self.onTransportError?([
                    "deviceId": self.sessionState.deviceId as Any,
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
