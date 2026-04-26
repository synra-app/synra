import Darwin
import Foundation
import Network

/// TCP transport + framed JSON protocol (matches Android `DeviceConnectionPlugin`).
public final class DeviceConnectionPluginCore: NSObject {
    internal let appId = "synra"
    internal let deviceTcpConnectEvent = "device.tcp.connect"
    internal let deviceTcpConnectAckEvent = "device.tcp.connect.ack"
    internal let deviceTcpAckEvent = "device.tcp.ack"
    internal let deviceTcpCloseEvent = "device.tcp.close"
    internal let deviceTcpErrorEvent = "device.tcp.error"
    internal let deviceTcpHeartbeatEvent = "device.tcp.heartbeat"
    internal let deviceDisplayNameChangedEvent = "device.display-name.changed"
    internal let devicePairingEventPrefix = "device.pairing."
    internal let legacyTypeConnect = "connect"
    internal let legacyTypeConnectAck = "connectAck"
    internal let legacyTypeAck = "ack"
    internal let legacyTypeClose = "close"
    internal let legacyTypeHeartbeat = "heartbeat"
    internal let legacyTypeError = "error"
    internal let errorCodeTransportIoError = "TRANSPORT_IO_ERROR"
    internal let errorCodeConnectInvalid = "CONNECT_INVALID"
    internal let errorCodeConnectNotEstablished = "CONNECT_NOT_ESTABLISHED"
    private let connectAckTimeoutMs = 6000
    private let maxFrameBytes = 256 * 1024
    private let unifiedDeviceUuidDefaultsKey = "synra.preferences.synra.device.instance-uuid"
    private let deviceBasicInfoDefaultsKey = "synra.preferences.synra.device.basic-info"
    private let legacyDeviceDisplayNameDefaultsKey = "synra.preferences.synra.device.display-name"
    private let legacyDeviceUuidStorageKey = "synra.device-connection.device-uuid"

    private var outboundTransportState = OutboundTransportState()
    private var connection: NWConnection?

    public var onMessageReceived: (([String: Any]) -> Void)?
    public var onMessageAck: (([String: Any]) -> Void)?
    public var onLanWireEventReceived: (([String: Any]) -> Void)?
    public var onOutboundTransportOpened: (([String: Any]) -> Void)?
    public var onOutboundTransportClosed: (([String: Any]) -> Void)?
    public var onTransportError: (([String: Any]) -> Void)?

    internal let synraDefaultTcpPort: UInt16 = 32100
    internal let tcpServerQueue = DispatchQueue(label: "com.synra.device-connection.tcp-server")
    internal var tcpListener: NWListener?
    internal var inboundConnections: [String: SynraInboundConnectionContext] = [:]

    public func openTransport(
        deviceId: String,
        host: String,
        port: NSNumber,
        token: String?,
        connectType: String
    ) -> [String: Any]? {
        // SYNRA-COMM::DEVICE_HANDSHAKE::CONNECT::OPEN_TRANSPORT
        let tcpPort = NWEndpoint.Port(rawValue: port.uint16Value)
        guard let endpointPort = tcpPort else {
            outboundTransportState.state = "error"
            outboundTransportState.lastError = "INVALID_PORT"
            return nil
        }

        if outboundTransportState.state == "open" {
            onOutboundTransportClosed?([
                "deviceId": outboundTransportState.deviceId as Any,
                "reason": "replaced",
                "transport": "tcp",
            ])
        }

        closeTransport(target: nil)

        let dialCanonicalDeviceId = canonicalSynraDeviceId(fromWireSourceDeviceId: deviceId.trimmingCharacters(in: .whitespacesAndNewlines))
        if dialCanonicalDeviceId.isEmpty {
            outboundTransportState.state = "error"
            outboundTransportState.lastError = "MISSING_DEVICE_ID"
            return nil
        }

        outboundTransportState.state = "connecting"
        outboundTransportState.deviceId = dialCanonicalDeviceId
        outboundTransportState.host = host
        outboundTransportState.port = Int(port.uint16Value)
        outboundTransportState.lastError = nil

        let nwConnection = NWConnection(host: NWEndpoint.Host(host), port: endpointPort, using: .tcp)
        connection = nwConnection
        let semaphore = DispatchSemaphore(value: 0)
        var opened = false
        var openError: String?
        var lastConnectAckPayload: [String: Any]?
        let connectRequestId = UUID().uuidString

        let connectPayload: Any? = {
            var payload: [String: Any] = [
                "appId": appId,
                "from": localDeviceUuid(),
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
                    type: self.legacyTypeConnect,
                    requestId: connectRequestId,
                    event: nil,
                    from: self.localDeviceUuid(),
                    target: dialCanonicalDeviceId,
                    replyRequestId: nil,
                    payload: connectPayload,
                    timestamp: nil,
                    error: nil
                )
                self.sendFrame(frame, through: nwConnection)
                self.receiveSingleFrame(through: nwConnection) { response in
                    guard let response else {
                        openError = "MISSING_CONNECT_ACK"
                        semaphore.signal()
                        return
                    }
                    if response["event"] as? String != self.deviceTcpConnectAckEvent {
                        openError = "MISSING_CONNECT_ACK"
                        semaphore.signal()
                        return
                    }
                    let ackPayload = response["payload"] as? [String: Any]
                    if ackPayload?["appId"] as? String != self.appId {
                        openError = "APP_ID_MISMATCH"
                        semaphore.signal()
                        return
                    }
                    lastConnectAckPayload = ackPayload
                    let remoteDeviceId = ackPayload?["from"] as? String
                    if remoteDeviceId?.isEmpty != false {
                        openError = "FROM_REQUIRED"
                        semaphore.signal()
                        return
                    }
                    let ackDisplay = (ackPayload?["displayName"] as? String)?
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    self.outboundTransportState.peerDisplayName =
                        (ackDisplay?.isEmpty == false) ? ackDisplay : nil
                    self.outboundTransportState.state = "open"
                    // Keep dial-side canonical id (matches discovery / JS `target`), not ack `from`
                    // which may be a raw instance UUID on the peer (e.g. Electron).
                    self.outboundTransportState.openedAt = self.now()
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
        let timeout = DispatchTime.now() + .milliseconds(connectAckTimeoutMs)
        if semaphore.wait(timeout: timeout) == .timedOut {
            openError = "TRANSPORT_OPEN_TIMEOUT"
        }

        if opened {
            var payload: [String: Any] = [
                "success": true,
                "deviceId": outboundTransportState.deviceId as Any,
                "state": outboundTransportState.state,
                "transport": "tcp",
            ]
            if let name = outboundTransportState.peerDisplayName, !name.isEmpty {
                payload["displayName"] = name
            }
            if let lastConnectAckPayload {
                payload["connectAckPayload"] = lastConnectAckPayload
            }
            return payload
        }

        outboundTransportState.state = "error"
        outboundTransportState.lastError = openError ?? "TRANSPORT_OPEN_FAILED"
        nwConnection.cancel()
        connection = nil
        return nil
    }

    public func closeTransport(target: String?) -> [String: Any] {
        // SYNRA-COMM::TCP::CLOSE::TRANSPORT_CLOSE
        if let target,
           let inboundEntry = inboundConnections.first(where: { $0.value.canonicalDeviceId == target })
        {
            closeSynraInboundConnection(
                connectionId: inboundEntry.key,
                reason: "closed-by-client",
                emitTransportClosed: true
            )
            return [
                "success": true,
                "target": target as Any,
                "transport": "tcp",
            ]
        }
        if outboundTransportState.state == "open", let remoteId = outboundTransportState.deviceId, let conn = connection {
            let closeFrame = synraLanFrame(
                type: legacyTypeClose,
                requestId: UUID().uuidString,
                event: nil,
                from: localDeviceUuid(),
                target: remoteId,
                replyRequestId: nil,
                payload: nil,
                timestamp: nil,
                error: nil
            )
            sendFrame(closeFrame, through: conn)
        }
        connection?.cancel()
        connection = nil
        outboundTransportState.state = "closed"
        outboundTransportState.closedAt = now()
        return [
            "success": true,
            "target": target as Any,
            "transport": "tcp",
        ]
    }

    public func sendMessage(
        requestId: String,
        from: String,
        target: String,
        replyRequestId: String?,
        event: String,
        payload: Any,
        timestamp: Int?
    ) -> [String: Any]? {
        // SYNRA-COMM::TCP::SEND::MESSAGE_SEND
        let messageFrame = synraLanFrame(
            type: "message",
            requestId: requestId,
            event: event,
            from: from,
            target: target,
            replyRequestId: replyRequestId,
            payload: payload,
            timestamp: timestamp,
            error: nil
        )
        // Prefer the primary outbound transport when it targets this peer. Otherwise a LAN probe
        // from the peer (inbound) can share the same canonical id and would steal sends.
        if outboundTransportState.state == "open",
           let conn = connection,
           let outboundPeer = outboundTransportState.deviceId,
           outboundPeer == target
        {
            sendFrame(messageFrame, through: conn)
            return [
                "success": true,
                "target": target,
                "transport": "tcp",
            ]
        }
        if let inbound = inboundConnections.first(where: { $0.value.canonicalDeviceId == target })?.value {
            sendFrame(messageFrame, through: inbound.connection)
            return [
                "success": true,
                "target": target,
                "transport": "tcp",
            ]
        }
        guard outboundTransportState.state == "open", let conn = connection else {
            outboundTransportState.lastError = "TRANSPORT_NOT_OPEN"
            return nil
        }

        sendFrame(messageFrame, through: conn)
        return [
            "success": true,
            "target": target,
            "transport": "tcp",
        ]
    }

    public func sendLanEvent(
        requestId: String,
        from: String,
        target: String,
        replyRequestId: String?,
        event: String,
        payload: Any?,
        timestamp: Int?
    ) -> [String: Any]? {
        // SYNRA-COMM::TCP::SEND::LAN_EVENT_SEND
        let eventFrame = synraLanFrame(
            type: "event",
            requestId: requestId,
            event: event,
            from: from,
            target: target,
            replyRequestId: replyRequestId,
            payload: payload,
            timestamp: timestamp,
            error: nil
        )
        if outboundTransportState.state == "open",
           let conn = connection,
           let outboundPeer = outboundTransportState.deviceId,
           outboundPeer == target
        {
            sendFrame(eventFrame, through: conn)
            return [
                "success": true,
                "target": target,
                "transport": "tcp",
            ]
        }
        if let inbound = inboundConnections.first(where: { $0.value.canonicalDeviceId == target })?.value {
            sendFrame(eventFrame, through: inbound.connection)
            return [
                "success": true,
                "target": target,
                "transport": "tcp",
            ]
        }
        guard outboundTransportState.state == "open", let conn = connection else {
            outboundTransportState.lastError = "TRANSPORT_NOT_OPEN"
            return nil
        }

        sendFrame(eventFrame, through: conn)
        return [
            "success": true,
            "target": target,
            "transport": "tcp",
        ]
    }

    public func getTransportState(target: String?) -> [String: Any] {
        if let target, let currentDeviceId = outboundTransportState.deviceId, target != currentDeviceId {
            return [
                "deviceId": target,
                "state": "closed",
                "transport": "tcp",
                "closedAt": now(),
                "lastError": "TRANSPORT_PEER_NOT_FOUND",
            ]
        }

        var dict = outboundTransportState.toDictionary()
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

    internal func canonicalSynraDeviceId(fromWireSourceDeviceId raw: String) -> String {
        raw.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    internal func fallbackPeerDisplayName(forCanonicalDeviceId id: String) -> String {
        let trimmed = id.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return "Synra device"
        }
        let prefix = String(trimmed.replacingOccurrences(of: "-", with: "").prefix(6))
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

    private func mapWireEventName(_ legacyType: String, appEvent: String?) -> String {
        if legacyType == legacyTypeConnect { return deviceTcpConnectEvent }
        if legacyType == legacyTypeConnectAck { return deviceTcpConnectAckEvent }
        if legacyType == legacyTypeAck { return deviceTcpAckEvent }
        if legacyType == legacyTypeClose { return deviceTcpCloseEvent }
        if legacyType == legacyTypeHeartbeat { return deviceTcpHeartbeatEvent }
        if legacyType == legacyTypeError { return deviceTcpErrorEvent }
        return appEvent ?? ""
    }

    internal func isTransportControlEvent(_ wireEvent: String) -> Bool {
        wireEvent == deviceTcpConnectEvent ||
            wireEvent == deviceTcpConnectAckEvent ||
            wireEvent == deviceTcpAckEvent ||
            wireEvent == deviceTcpCloseEvent ||
            wireEvent == deviceTcpHeartbeatEvent ||
            wireEvent == deviceTcpErrorEvent
    }

    internal func isLanWireEvent(_ wireEvent: String) -> Bool {
        wireEvent == deviceDisplayNameChangedEvent || wireEvent.hasPrefix(devicePairingEventPrefix)
    }

    internal func buildTransportErrorEventFromWire(
        frame: [String: Any],
        fallbackDeviceId: String?
    ) -> [String: Any] {
        let payload = frame["payload"] as? [String: Any]
        let message =
            (payload?["message"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
        let code =
            (payload?["code"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
        var event: [String: Any] = [
            "deviceId": fallbackDeviceId as Any,
            "message": (message?.isEmpty == false) ? message! : "Transport error",
            "transport": "tcp",
        ]
        if let code, !code.isEmpty {
            event["code"] = code
        } else {
            event["code"] = errorCodeTransportIoError
        }
        return event
    }

    internal func synraLanFrame(
        type legacyType: String,
        requestId: String,
        event: String?,
        from: String?,
        target: String?,
        replyRequestId: String?,
        payload: Any?,
        timestamp: Int?,
        error: String?
    ) -> [String: Any] {
        var base: [String: Any] = [
            "event": mapWireEventName(legacyType, appEvent: event),
            "requestId": requestId,
            "timestamp": timestamp ?? now(),
        ]
        if let from, !from.isEmpty {
            base["from"] = from
        }
        if let target, !target.isEmpty {
            base["target"] = target
        }
        if let replyRequestId, !replyRequestId.isEmpty {
            base["replyRequestId"] = replyRequestId
        }
        if let payload {
            base["payload"] = payload
        }
        if let error, !error.isEmpty {
            var errorPayload = (base["payload"] as? [String: Any]) ?? [:]
            errorPayload["appId"] = appId
            errorPayload["code"] = error
            base["payload"] = errorPayload
        }
        return base
    }

    internal func sendFrame(
        _ frame: [String: Any],
        through target: NWConnection,
        onSent: (() -> Void)? = nil
    ) {
        // SYNRA-COMM::TCP::SEND::FRAME_WRITE
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
        // SYNRA-COMM::TCP::RECEIVE::FRAME_READ
        target.receive(minimumIncompleteLength: 4, maximumLength: 4) { header, _, _, _ in
            guard let header, header.count == 4 else {
                completion(nil)
                return
            }

            let length = header.withUnsafeBytes { pointer -> UInt32 in
                pointer.load(as: UInt32.self).bigEndian
            }
            if length == 0 || length > UInt32(self.maxFrameBytes) {
                completion(nil)
                return
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
        // SYNRA-COMM::TCP::RECEIVE::OUTBOUND_RECV_LOOP
        receiveSingleFrame(through: target) { [weak self] frame in
            guard let self else {
                return
            }
            guard let frame else {
                let shouldNotifyClosed = self.outboundTransportState.state == "open"
                self.outboundTransportState.state = "closed"
                self.outboundTransportState.closedAt = self.now()
                self.connection?.cancel()
                self.connection = nil
                if shouldNotifyClosed {
                    self.onOutboundTransportClosed?([
                        "deviceId": self.outboundTransportState.deviceId as Any,
                        "reason": "socket-closed",
                        "transport": "tcp",
                    ])
                }
                return
            }

            let wireEvent = frame["event"] as? String ?? ""
            if wireEvent == self.deviceTcpCloseEvent {
                self.outboundTransportState.state = "closed"
                self.outboundTransportState.closedAt = self.now()
                self.connection?.cancel()
                self.connection = nil
                self.onOutboundTransportClosed?([
                    "deviceId": self.outboundTransportState.deviceId as Any,
                    "reason": "peer-closed",
                    "transport": "tcp",
                ])
                return
            }
            if wireEvent == self.deviceTcpAckEvent {
                self.onMessageAck?([
                    "target": frame["target"] as Any ?? self.outboundTransportState.deviceId as Any,
                    "event": frame["event"] as Any,
                    "from": frame["from"] as Any,
                    "replyRequestId": frame["replyRequestId"] as Any,
                    "requestId": frame["requestId"] as Any,
                    "timestamp": frame["timestamp"] as? Int ?? self.now(),
                    "transport": "tcp",
                ])
            } else if wireEvent == self.deviceTcpHeartbeatEvent {
                // no-op
            } else if wireEvent == self.deviceTcpErrorEvent {
                self.onTransportError?(
                    self.buildTransportErrorEventFromWire(
                        frame: frame,
                        fallbackDeviceId: self.outboundTransportState.deviceId
                    )
                )
            // SYNRA-COMM::MESSAGE_ENVELOPE::RECEIVE::LAN_EVENT_ROUTE
            } else if !self.isTransportControlEvent(wireEvent) {
                let topRequestId = frame["requestId"] as? String
                let eventPayload: [String: Any] = [
                    "requestId": topRequestId as Any,
                    "from": frame["from"] as Any,
                    "target": frame["target"] as Any,
                    "replyRequestId": frame["replyRequestId"] as Any,
                    "event": frame["event"] as Any,
                    "payload": frame["payload"] as Any,
                    "timestamp": frame["timestamp"] as? Int ?? self.now(),
                    "transport": "tcp",
                ]
                if self.isLanWireEvent(wireEvent) {
                    self.onLanWireEventReceived?(eventPayload)
                } else {
                    self.onMessageReceived?(eventPayload)
                }
                // SYNRA-COMM::TCP::ACK::MESSAGE_ACK_AUTO
                if let topRequestId, !topRequestId.isEmpty {
                    let ackTarget =
                        (frame["target"] as? String)?
                            .trimmingCharacters(in: .whitespacesAndNewlines)
                    self.sendFrame(
                        self.synraLanFrame(
                            type: self.legacyTypeAck,
                            requestId: topRequestId,
                            event: frame["event"] as? String,
                            from: self.localDeviceUuid(),
                            target: (ackTarget?.isEmpty == false) ? ackTarget : self.outboundTransportState.deviceId,
                            replyRequestId: topRequestId,
                            payload: nil,
                            timestamp: nil,
                            error: nil
                        ),
                        through: target
                    )
                }
            }
            self.startReceiveLoop(on: target)
        }
    }
}

private struct OutboundTransportState {
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
