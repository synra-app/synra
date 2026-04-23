import Foundation
import Network

extension DeviceConnectionPluginCore {
    func startSynraTcpServerIfNeeded() {
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
                        "code": "TRANSPORT_IO_ERROR",
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
            closeSynraInboundConnection(connectionId: connectionId, reason: "server-stopped", emitSessionClosed: true)
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
                    "code": "TRANSPORT_IO_ERROR",
                    "message": error.localizedDescription,
                    "transport": "tcp",
                ])
                self.closeSynraInboundConnection(
                    connectionId: connectionId,
                    reason: "socket-failed",
                    emitSessionClosed: true
                )
            case .cancelled:
                self.closeSynraInboundConnection(
                    connectionId: connectionId,
                    reason: "socket-cancelled",
                    emitSessionClosed: true
                )
            default:
                break
            }
        }

        connection.start(queue: tcpServerQueue)
        startSynraInboundReceiveLoop(connectionId: connectionId)
    }

    private func startSynraInboundReceiveLoop(connectionId: String) {
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
                    emitSessionClosed: true
                )
                return
            }

            let type = frame["type"] as? String ?? ""
            let sessionId = current.sessionId ?? frame["sessionId"] as? String ?? UUID().uuidString
            if type == "connect" {
                let connectPayload = frame["payload"] as? [String: Any]
                let sourceDeviceId = connectPayload?["sourceDeviceId"] as? String
                let peerDisplayName = (connectPayload?["displayName"] as? String)?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                let appOk = frame["appId"] as? String == self.appId
                guard appOk, let sourceDeviceId, !sourceDeviceId.isEmpty else {
                    self.sendFrame(
                        self.frame(
                            type: "error",
                            sessionId: sessionId,
                            messageId: nil,
                            payload: "CONNECT_INVALID"
                        ),
                        through: current.connection
                    )
                    self.closeSynraInboundConnection(
                        connectionId: connectionId,
                        reason: "connect-invalid",
                        emitSessionClosed: false
                    )
                    return
                }
                current.sessionId = sessionId
                var connectAckPayload: [String: Any] = [
                    "sourceDeviceId": self.localDeviceUuid(),
                    "displayName": self.localSynraDisplayName(),
                ]
                if let selfIp = self.primarySourceHostIpv4(), !selfIp.isEmpty {
                    connectAckPayload["sourceHostIp"] = selfIp
                }
                let (observedPeerIpRaw, _) = self.describeSynraHostPort(current.connection.endpoint)
                if let observedPeerIp = observedPeerIpRaw, !observedPeerIp.isEmpty {
                    connectAckPayload["observedPeerIp"] = observedPeerIp
                }
                self.sendFrame(
                    self.frame(
                        type: "connectAck",
                        sessionId: sessionId,
                        messageId: nil,
                        payload: connectAckPayload
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
                let canonicalForOpened = self.canonicalSynraDeviceId(fromWireSourceDeviceId: sourceDeviceId)
                let openedDisplayName: String
                if let peerDisplayName, !peerDisplayName.isEmpty {
                    openedDisplayName = peerDisplayName
                } else {
                    openedDisplayName = self.fallbackPeerDisplayName(forCanonicalDeviceId: canonicalForOpened)
                }
                let incomingSynraConnectPayload: [String: Any] = connectPayload ?? [:]
                let opened: [String: Any] = [
                    "sessionId": sessionId,
                    "deviceId": canonicalForOpened,
                    "direction": "inbound",
                    "transport": "tcp",
                    "host": host as Any,
                    "port": Int(self.synraDefaultTcpPort),
                    "displayName": openedDisplayName,
                    "connectAckPayload": connectAckPayload,
                    "incomingSynraConnectPayload": incomingSynraConnectPayload,
                ]
                self.onSessionOpened?(opened)
            } else if type == "message" {
                guard let establishedSessionId = current.sessionId, establishedSessionId == sessionId else {
                    self.sendFrame(
                        self.frame(
                            type: "error",
                            sessionId: sessionId,
                            messageId: nil,
                            payload: "SESSION_NOT_ESTABLISHED"
                        ),
                        through: current.connection
                    )
                    self.startSynraInboundReceiveLoop(connectionId: connectionId)
                    return
                }
                let payload = frame["payload"] as? [String: Any]
                let messageId = frame["messageId"] as? String
                self.onMessageReceived?([
                    "sessionId": establishedSessionId,
                    "messageId": messageId as Any,
                    "messageType": payload?["messageType"] as? String ?? "transport.message.received",
                    "payload": payload?["payload"] as Any,
                    "timestamp": frame["timestamp"] as? Int ?? self.now(),
                    "transport": "tcp",
                ])
                if let messageId, !messageId.isEmpty {
                    self.sendFrame(
                        self.frame(type: "ack", sessionId: establishedSessionId, messageId: messageId, payload: nil),
                        through: current.connection
                    )
                }
            } else if type == "event" {
                guard let establishedSessionId = current.sessionId, establishedSessionId == sessionId else {
                    self.startSynraInboundReceiveLoop(connectionId: connectionId)
                    return
                }
                let pl = frame["payload"] as? [String: Any]
                let name = pl?["eventName"] as? String ?? ""
                self.onLanWireEventReceived?([
                    "sessionId": establishedSessionId,
                    "eventName": name,
                    "eventPayload": pl?["payload"] as Any,
                    "transport": "tcp",
                ])
            } else if type == "close" {
                guard let establishedSessionId = current.sessionId, establishedSessionId == sessionId else {
                    self.closeSynraInboundConnection(
                        connectionId: connectionId,
                        reason: "peer-closed",
                        emitSessionClosed: false
                    )
                    return
                }
                current.sessionId = establishedSessionId
                self.closeSynraInboundConnection(
                    connectionId: connectionId,
                    reason: "peer-closed",
                    emitSessionClosed: true
                )
                return
            }

            self.startSynraInboundReceiveLoop(connectionId: connectionId)
        }
    }

    func closeSynraInboundConnection(
        connectionId: String,
        reason: String,
        emitSessionClosed: Bool
    ) {
        guard let context = inboundConnections.removeValue(forKey: connectionId) else {
            return
        }
        if emitSessionClosed, context.sessionId != nil {
            onSessionClosed?([
                "sessionId": context.sessionId as Any,
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
