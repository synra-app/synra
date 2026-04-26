import Foundation
import Network

extension DeviceConnectionPluginCore {
    func startSynraTcpServerIfNeeded() {
        // SYNRA-COMM::TCP::CONNECT::INBOUND_LISTEN
        if tcpListener != nil {
            return
        }
        guard let port = NWEndpoint.Port(rawValue: synraDefaultTcpPort) else {
            return
        }
        do {
            let listener = try NWListener(using: .tcp, on: port)
            listener.stateUpdateHandler = { [weak self] state in
                switch state {
                case .failed(let error):
                    self?.onTransportError?([
                        "code": self?.errorCodeTransportIoError ?? "TRANSPORT_IO_ERROR",
                        "message": error.localizedDescription,
                        "transport": "tcp",
                    ])
                default:
                    break
                }
            }
            listener.newConnectionHandler = { [weak self] connection in
                self?.acceptSynraInboundConnection(connection)
            }
            listener.start(queue: tcpServerQueue)
            tcpListener = listener
        } catch {}
    }

    func stopSynraTcpServer() {
        tcpListener?.cancel()
        tcpListener = nil
        let connectionIds = Array(inboundConnections.keys)
        for connectionId in connectionIds {
            closeSynraInboundConnection(connectionId: connectionId, reason: "server-stopped", emitTransportClosed: true)
        }
    }

    private func acceptSynraInboundConnection(_ connection: NWConnection) {
        let connectionId = UUID().uuidString
        let remote = describeSynraEndpoint(connection.endpoint)
        inboundConnections[connectionId] = SynraInboundConnectionContext(connection: connection, remote: remote)

        connection.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .failed(let error):
                self.onTransportError?([
                    "code": self.errorCodeTransportIoError,
                    "message": error.localizedDescription,
                    "transport": "tcp",
                ])
                self.closeSynraInboundConnection(
                    connectionId: connectionId,
                    reason: "socket-failed",
                    emitTransportClosed: true
                )
            case .cancelled:
                self.closeSynraInboundConnection(
                    connectionId: connectionId,
                    reason: "socket-cancelled",
                    emitTransportClosed: true
                )
            default:
                break
            }
        }

        connection.start(queue: tcpServerQueue)
        startSynraInboundReceiveLoop(connectionId: connectionId)
    }

    private func startSynraInboundReceiveLoop(connectionId: String) {
        // SYNRA-COMM::TCP::RECEIVE::INBOUND_RECV_LOOP
        guard let context = inboundConnections[connectionId] else {
            return
        }

        receiveSingleFrame(through: context.connection) { [weak self] frame in
            guard let self else {
                return
            }
            guard let current = self.inboundConnections[connectionId] else {
                return
            }
            guard let frame else {
                self.closeSynraInboundConnection(
                    connectionId: connectionId,
                    reason: "peer-closed",
                    emitTransportClosed: true
                )
                return
            }

            let wireEvent = frame["event"] as? String ?? ""
            let rawConnectRid = (frame["requestId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            let connectRequestId =
                (rawConnectRid?.isEmpty == false) ? rawConnectRid! : UUID().uuidString
            // SYNRA-COMM::DEVICE_HANDSHAKE::CONNECT::INBOUND_ACCEPT
            if wireEvent == self.deviceTcpConnectEvent {
                let connectPayload = frame["payload"] as? [String: Any]
                let from = connectPayload?["from"] as? String
                let target = (frame["target"] as? String)?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                let peerDisplayName = (connectPayload?["displayName"] as? String)?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                let appOk = connectPayload?["appId"] as? String == self.appId
                let localUuid = self.localDeviceUuid()
                let targetValid = (target?.isEmpty == false) && target == localUuid
                guard appOk, let from, !from.isEmpty, targetValid else {
                    self.sendFrame(
                        self.synraLanFrame(
                            type: self.legacyTypeError,
                            requestId: connectRequestId,
                            event: nil,
                            from: localUuid,
                            target: nil,
                            replyRequestId: nil,
                            payload: nil,
                            timestamp: nil,
                            error: self.errorCodeConnectInvalid
                        ),
                        through: current.connection
                    )
                    self.closeSynraInboundConnection(
                        connectionId: connectionId,
                        reason: "connect-invalid",
                        emitTransportClosed: false
                    )
                    return
                }
                var connectAckPayload: [String: Any] = [
                    "appId": self.appId,
                    "from": localUuid,
                    "displayName": self.localSynraDisplayName(),
                ]
                if let selfIp = self.primarySourceHostIpv4(), !selfIp.isEmpty {
                    connectAckPayload["sourceHostIp"] = selfIp
                }
                let (observedPeerIpRaw, _) = self.describeSynraHostPort(current.connection.endpoint)
                if let observedPeerIp = observedPeerIpRaw, !observedPeerIp.isEmpty {
                    connectAckPayload["observedPeerIp"] = observedPeerIp
                }
                let canonicalForAck = self.canonicalSynraDeviceId(fromWireSourceDeviceId: from)
                self.sendFrame(
                    self.synraLanFrame(
                        type: self.legacyTypeConnectAck,
                        requestId: connectRequestId,
                        event: nil,
                        from: localUuid,
                        target: canonicalForAck,
                        replyRequestId: nil,
                        payload: connectAckPayload,
                        timestamp: nil,
                        error: nil
                    ),
                    through: current.connection
                )
                let (hostFallback, _) = self.describeSynraHostPort(current.connection.endpoint)
                let sourceHostIpRaw =
                    (connectPayload?["sourceHostIp"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
                let resolvedPeerIpv4 = self.normalizeSynraInboundPeerHost(
                    sourceHostIp: sourceHostIpRaw,
                    observedHost: observedPeerIpRaw
                )
                let host =
                    (resolvedPeerIpv4 ?? hostFallback)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? hostFallback
                let canonicalForOpened = canonicalForAck
                current.canonicalDeviceId = canonicalForOpened
                let openedDisplayName: String
                if let peerDisplayName, !peerDisplayName.isEmpty {
                    openedDisplayName = peerDisplayName
                } else {
                    openedDisplayName = self.fallbackPeerDisplayName(forCanonicalDeviceId: canonicalForOpened)
                }
                let incomingSynraConnectPayload: [String: Any] = connectPayload ?? [:]
                let opened: [String: Any] = [
                    "deviceId": canonicalForOpened,
                    "direction": "inbound",
                    "transport": "tcp",
                    "host": host as Any,
                    "port": Int(self.synraDefaultTcpPort),
                    "displayName": openedDisplayName,
                    "connectAckPayload": connectAckPayload,
                    "incomingSynraConnectPayload": incomingSynraConnectPayload,
                ]
                self.onOutboundTransportOpened?(opened)
            // SYNRA-COMM::MESSAGE_ENVELOPE::RECEIVE::LAN_EVENT_ROUTE
            } else if !self.isTransportControlEvent(wireEvent) {
                guard current.canonicalDeviceId != nil else {
                    let errRid = (frame["requestId"] as? String) ?? UUID().uuidString
                    self.sendFrame(
                        self.synraLanFrame(
                            type: self.legacyTypeError,
                            requestId: errRid,
                            event: nil,
                            from: self.localDeviceUuid(),
                            target: nil,
                            replyRequestId: nil,
                            payload: nil,
                            timestamp: nil,
                            error: self.errorCodeConnectNotEstablished
                        ),
                        through: current.connection
                    )
                    self.startSynraInboundReceiveLoop(connectionId: connectionId)
                    return
                }
                let topRid = frame["requestId"] as? String
                let eventPayload: [String: Any] = [
                    "requestId": topRid as Any,
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
                if let requestId = topRid, !requestId.isEmpty {
                    let ackRid = topRid ?? UUID().uuidString
                    let ackTargetRaw =
                        (frame["target"] as? String)?
                            .trimmingCharacters(in: .whitespacesAndNewlines)
                    self.sendFrame(
                        self.synraLanFrame(
                            type: self.legacyTypeAck,
                            requestId: ackRid,
                            event: frame["event"] as? String,
                            from: self.localDeviceUuid(),
                            target: (ackTargetRaw?.isEmpty == false) ? ackTargetRaw : current.canonicalDeviceId,
                            replyRequestId: requestId,
                            payload: nil,
                            timestamp: nil,
                            error: nil
                        ),
                        through: current.connection
                    )
                }
            } else if wireEvent == self.deviceTcpCloseEvent {
                self.closeSynraInboundConnection(
                    connectionId: connectionId,
                    reason: "peer-closed",
                    emitTransportClosed: current.canonicalDeviceId != nil
                )
                return
            } else if wireEvent == self.deviceTcpErrorEvent {
                self.onTransportError?(
                    self.buildTransportErrorEventFromWire(
                        frame: frame,
                        fallbackDeviceId: current.canonicalDeviceId
                    )
                )
            }

            self.startSynraInboundReceiveLoop(connectionId: connectionId)
        }
    }

    func closeSynraInboundConnection(
        connectionId: String,
        reason: String,
        emitTransportClosed: Bool
    ) {
        guard let context = inboundConnections.removeValue(forKey: connectionId) else {
            return
        }
        if emitTransportClosed, context.canonicalDeviceId != nil {
            onOutboundTransportClosed?([
                "deviceId": context.canonicalDeviceId as Any,
                "reason": reason,
                "transport": "tcp",
            ])
        }
        context.connection.cancel()
    }

    private func describeSynraEndpoint(_ endpoint: NWEndpoint) -> String {
        switch endpoint {
        case .hostPort(let host, let port):
            return "\(host):\(port.rawValue)"
        default:
            return "\(endpoint)"
        }
    }

    private func describeSynraHostPort(_ endpoint: NWEndpoint) -> (String?, Int?) {
        switch endpoint {
        case .hostPort(let host, let port):
            return ("\(host)", Int(port.rawValue))
        default:
            return (nil, nil)
        }
    }

    private func isSynraIpv4String(_ value: String) -> Bool {
        let t = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty || t.contains(":") {
            return false
        }
        let parts = t.split(separator: ".")
        guard parts.count == 4 else {
            return false
        }
        for p in parts {
            guard let n = Int(p), n >= 0, n <= 255 else {
                return false
            }
        }
        return true
    }

    private func normalizeSynraInboundPeerHost(sourceHostIp: String?, observedHost: String?) -> String? {
        if let s = sourceHostIp, isSynraIpv4String(s) {
            return s.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let o = observedHost, isSynraIpv4String(o) {
            return o.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return nil
    }
}
