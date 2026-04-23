import Foundation
import Network

extension LanDiscoveryPlugin {
    static func logLanDiscovery(_ message: String) {
        #if DEBUG
            print("[lan-discovery] \(message)")
        #endif
    }

    func startTcpServer() {
        if tcpListener != nil {
            return
        }
        guard let port = NWEndpoint.Port(rawValue: defaultTcpPort) else {
            return
        }
        do {
            let listener = try NWListener(using: .tcp, on: port)
            listener.stateUpdateHandler = { [weak self] state in
                switch state {
                case .ready:
                    break
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
                self?.acceptInboundConnection(connection)
            }
            listener.start(queue: tcpServerQueue)
            tcpListener = listener
        } catch {}
    }

    func stopTcpServer() {
        tcpListener?.cancel()
        tcpListener = nil
        let connectionIds = Array(inboundConnections.keys)
        for connectionId in connectionIds {
            closeInboundConnection(connectionId: connectionId, reason: "server-stopped", emitSessionClosed: true)
        }
    }

    func acceptInboundConnection(_ connection: NWConnection) {
        let connectionId = UUID().uuidString
        let remote = describeEndpoint(connection.endpoint)
        inboundConnections[connectionId] = InboundConnectionContext(connection: connection, remote: remote)

        connection.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .failed(let error):
                self.onTransportError?([
                    "code": "TRANSPORT_IO_ERROR",
                    "message": error.localizedDescription,
                    "transport": "tcp",
                ])
                self.closeInboundConnection(
                    connectionId: connectionId,
                    reason: "socket-failed",
                    emitSessionClosed: true
                )
            case .cancelled:
                self.closeInboundConnection(
                    connectionId: connectionId,
                    reason: "socket-cancelled",
                    emitSessionClosed: true
                )
            default:
                break
            }
        }

        connection.start(queue: tcpServerQueue)
        startInboundReceiveLoop(connectionId: connectionId)
    }

    func startInboundReceiveLoop(connectionId: String) {
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
                self.closeInboundConnection(
                    connectionId: connectionId,
                    reason: "peer-closed",
                    emitSessionClosed: true
                )
                return
            }

            let type = frame["type"] as? String ?? ""
            let sessionId = current.sessionId ?? frame["sessionId"] as? String ?? UUID().uuidString
            if type == "hello" {
                let helloPayload = frame["payload"] as? [String: Any]
                let sourceDeviceId = helloPayload?["sourceDeviceId"] as? String
                let isProbe = (helloPayload?["probe"] as? Bool) ?? false
                let peerDisplayName = (helloPayload?["displayName"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
                let handshakeKind = helloPayload?["handshakeKind"] as? String
                let claimsPeerPaired = helloPayload?["claimsPeerPaired"] as? Bool
                let remotePairedPeerDeviceIds =
                    (helloPayload?["pairedPeerDeviceIds"] as? [Any] ?? [])
                        .compactMap { item -> String? in
                            guard let text = item as? String else {
                                return nil
                            }
                            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                            return trimmed.isEmpty ? nil : trimmed
                        }
                guard let sourceDeviceId, !sourceDeviceId.isEmpty else {
                    self.sendFrame(
                        self.frame(
                            type: "error",
                            sessionId: sessionId,
                            messageId: nil,
                            payload: "SOURCE_DEVICE_ID_REQUIRED"
                        ),
                        through: current.connection
                    )
                    self.closeInboundConnection(
                        connectionId: connectionId,
                        reason: "missing-device-id",
                        emitSessionClosed: false
                    )
                    return
                }
                current.sessionId = sessionId
                let sourceHostIpRaw =
                    (helloPayload?["sourceHostIp"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
                let (observedPeerIp, _) = self.describeHostPort(current.connection.endpoint)
                let resolvedPeerIpv4 = self.normalizeInboundPeerHost(
                    sourceHostIp: sourceHostIpRaw,
                    observedHost: observedPeerIp
                )
                if let hostForPeerList = resolvedPeerIpv4 ?? observedPeerIp,
                   self.isIpv4String(hostForPeerList)
                {
                    let canonicalPeerId = self.canonicalLanDeviceId(fromWireSourceDeviceId: sourceDeviceId)
                    let peerListName: String
                    if let peerDisplayName, !peerDisplayName.isEmpty {
                        peerListName = peerDisplayName
                    } else {
                        peerListName = self.fallbackPeerDisplayName(forCanonicalDeviceId: canonicalPeerId)
                    }
                    let trimmedHost = hostForPeerList.trimmingCharacters(in: .whitespacesAndNewlines)
                    Self.logLanDiscovery(
                        "inbound hello probe=\(isProbe) peer=\(canonicalPeerId) host=\(trimmedHost) name=\(peerListName)"
                    )
                    let checkedAt = self.now()
                    let record = DeviceRecord(
                        deviceId: canonicalPeerId,
                        name: peerListName,
                        ipAddress: trimmedHost,
                        source: "session",
                        connectable: true,
                        connectCheckAt: checkedAt,
                        connectCheckError: nil,
                        discoveredAt: checkedAt,
                        lastSeenAt: checkedAt
                    )
                    self.devices[canonicalPeerId] = record
                    var peerPayload = record.toDictionary()
                    peerPayload["port"] = Int(self.defaultTcpPort)
                    self.onDiscoveredPeerDevice?(["device": peerPayload])
                } else {
                    Self.logLanDiscovery(
                        "inbound hello probe=\(isProbe) unresolvedIPv4 observed=\(observedPeerIp ?? "nil") sourceHostIp=\(sourceHostIpRaw ?? "nil")"
                    )
                }
                var helloAckPayload: [String: Any] = [
                    "sourceDeviceId": self.localDeviceUuid(),
                    "displayName": self.localSynraDisplayName(),
                    "pairedPeerDeviceIds": self.readPairedPeerDeviceIdsFromDefaults(),
                ]
                if let selfIp = self.primarySourceHostIpv4(), !selfIp.isEmpty {
                    helloAckPayload["sourceHostIp"] = selfIp
                }
                if let observedPeerIp, !observedPeerIp.isEmpty {
                    helloAckPayload["observedPeerIp"] = observedPeerIp
                }
                self.sendFrame(
                    self.frame(
                        type: "helloAck",
                        sessionId: sessionId,
                        messageId: nil,
                        payload: helloAckPayload
                    ),
                    through: current.connection
                )
                let (hostFallback, _) = self.describeHostPort(current.connection.endpoint)
                let host =
                    (resolvedPeerIpv4 ?? hostFallback)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? hostFallback
                let canonicalForOpened = self.canonicalLanDeviceId(fromWireSourceDeviceId: sourceDeviceId)
                let openedDisplayName: String
                if let peerDisplayName, !peerDisplayName.isEmpty {
                    openedDisplayName = peerDisplayName
                } else {
                    openedDisplayName = self.fallbackPeerDisplayName(forCanonicalDeviceId: canonicalForOpened)
                }
                var opened: [String: Any] = [
                    "sessionId": sessionId,
                    "deviceId": canonicalForOpened,
                    "direction": "inbound",
                    "transport": "tcp",
                    "host": host as Any,
                    // Always report host TCP server port for reverse-connect handoff.
                    "port": Int(self.defaultTcpPort),
                    "pairedPeerDeviceIds": remotePairedPeerDeviceIds,
                    "displayName": openedDisplayName,
                ]
                if let handshakeKind, handshakeKind == "paired" || handshakeKind == "fresh" {
                    opened["handshakeKind"] = handshakeKind
                }
                if let claimsPeerPaired {
                    opened["claimsPeerPaired"] = claimsPeerPaired
                }
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
                    self.startInboundReceiveLoop(connectionId: connectionId)
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
            } else if type == "close" {
                guard let establishedSessionId = current.sessionId, establishedSessionId == sessionId else {
                    self.closeInboundConnection(
                        connectionId: connectionId,
                        reason: "peer-closed",
                        emitSessionClosed: false
                    )
                    return
                }
                current.sessionId = establishedSessionId
                self.closeInboundConnection(
                    connectionId: connectionId,
                    reason: "peer-closed",
                    emitSessionClosed: true
                )
                return
            }

            self.startInboundReceiveLoop(connectionId: connectionId)
        }
    }

    func closeInboundConnection(
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

    func describeEndpoint(_ endpoint: NWEndpoint) -> String {
        switch endpoint {
        case .hostPort(let host, let port):
            return "\(host):\(port.rawValue)"
        default:
            return "\(endpoint)"
        }
    }

    func describeHostPort(_ endpoint: NWEndpoint) -> (String?, Int?) {
        switch endpoint {
        case .hostPort(let host, let port):
            return ("\(host)", Int(port.rawValue))
        default:
            return (nil, nil)
        }
    }

    func isIpv4String(_ value: String) -> Bool {
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

    /// Prefer `sourceHostIp` from hello when it is a valid IPv4 (matches Android `normalizePeerHost`).
    func normalizeInboundPeerHost(sourceHostIp: String?, observedHost: String?) -> String? {
        if let s = sourceHostIp, isIpv4String(s) {
            return s.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let o = observedHost, isIpv4String(o) {
            return o.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return nil
    }

    func fallbackPeerDisplayName(forCanonicalDeviceId id: String) -> String {
        let trimmed = id.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return "Synra device"
        }
        let tail = trimmed.hasPrefix("device-") ? String(trimmed.dropFirst("device-".count)) : trimmed
        let prefix = String(tail.prefix(6))
        return prefix.isEmpty ? "Synra device" : "Peer \(prefix)"
    }
}
