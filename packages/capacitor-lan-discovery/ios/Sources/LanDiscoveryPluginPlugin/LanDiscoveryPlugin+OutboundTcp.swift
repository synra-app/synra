import Foundation
import Network

extension LanDiscoveryPlugin {
    func closeAllOutboundSessions() {
        for sid in Array(outboundConnections.keys) {
            closeOutboundSession(sessionId: sid, reason: "host-stopped", emitSessionClosed: true)
        }
    }

    func outboundHostPortKey(host: String, port: UInt16) -> String {
        "\(host.trimmingCharacters(in: .whitespacesAndNewlines)):\(port)"
    }

    func closeOutboundSession(sessionId: String, reason: String, emitSessionClosed: Bool) {
        guard let context = outboundConnections.removeValue(forKey: sessionId) else {
            return
        }
        if outboundHostPortToSessionId[context.hostPortKey] == sessionId {
            outboundHostPortToSessionId.removeValue(forKey: context.hostPortKey)
        }
        if emitSessionClosed {
            onSessionClosed?([
                "sessionId": sessionId,
                "reason": reason,
                "transport": "tcp",
            ])
        }
        context.connection.cancel()
    }

    /// After outbound hello/helloAck: keep socket, register session, emit `sessionOpened`, start read loop.
    func finalizeOutboundSynraSession(
        connection: NWConnection,
        host: String,
        port: UInt16,
        outgoingSessionId: String,
        canonRemote: String,
        displayName: String,
        helloAckPayload: [String: Any]?
    ) {
        let hostKey = outboundHostPortKey(host: host, port: port)
        if let oldSid = outboundHostPortToSessionId[hostKey], oldSid != outgoingSessionId {
            closeOutboundSession(sessionId: oldSid, reason: "replaced-by-scan", emitSessionClosed: true)
        }
        outboundHostPortToSessionId[hostKey] = outgoingSessionId
        let remoteLabel = "\(host):\(port)"
        outboundConnections[outgoingSessionId] = OutboundConnectionContext(
            connection: connection,
            host: host,
            port: port,
            hostPortKey: hostKey,
            sessionId: outgoingSessionId,
            remoteLabel: remoteLabel
        )

        let checkedAt = now()
        let record = DeviceRecord(
            deviceId: canonRemote,
            name: displayName,
            ipAddress: host,
            source: "probe",
            connectable: true,
            connectCheckAt: checkedAt,
            connectCheckError: nil,
            discoveredAt: checkedAt,
            lastSeenAt: checkedAt
        )
        devices[canonRemote] = record
        var peerPayload = record.toDictionary()
        peerPayload["port"] = Int(port)
        onDiscoveredPeerDevice?(["device": peerPayload])

        var opened: [String: Any] = [
            "sessionId": outgoingSessionId,
            "deviceId": canonRemote,
            "direction": "outbound",
            "transport": "tcp",
            "host": host,
            "port": Int(port),
            "displayName": displayName,
        ]
        if let ack = helloAckPayload {
            let remotePaired =
                (ack["pairedPeerDeviceIds"] as? [Any] ?? [])
                    .compactMap { item -> String? in
                        guard let text = item as? String else {
                            return nil
                        }
                        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                        return trimmed.isEmpty ? nil : trimmed
                    }
            if !remotePaired.isEmpty {
                opened["pairedPeerDeviceIds"] = remotePaired
            }
            if let hk = ack["handshakeKind"] as? String, hk == "paired" || hk == "fresh" {
                opened["handshakeKind"] = hk
            }
            if let claims = ack["claimsPeerPaired"] as? Bool {
                opened["claimsPeerPaired"] = claims
            }
        }
        onSessionOpened?(opened)

        connection.stateUpdateHandler = { [weak self] state in
            guard let self else {
                return
            }
            switch state {
            case .failed, .cancelled:
                self.closeOutboundSession(sessionId: outgoingSessionId, reason: "socket-ended", emitSessionClosed: true)
            default:
                break
            }
        }
        startOutboundReceiveLoop(sessionId: outgoingSessionId)
    }

    func startOutboundReceiveLoop(sessionId: String) {
        guard let context = outboundConnections[sessionId] else {
            return
        }
        receiveSingleFrame(through: context.connection) { [weak self] frame in
            guard let self else {
                return
            }
            guard let current = self.outboundConnections[sessionId] else {
                return
            }
            guard let frame else {
                self.closeOutboundSession(sessionId: sessionId, reason: "peer-closed", emitSessionClosed: true)
                return
            }
            let type = frame["type"] as? String ?? ""
            let frameSessionId = frame["sessionId"] as? String ?? sessionId
            if type == "message" {
                let payload = frame["payload"] as? [String: Any]
                let messageId = frame["messageId"] as? String
                self.onMessageReceived?([
                    "sessionId": sessionId,
                    "messageId": messageId as Any,
                    "messageType": payload?["messageType"] as? String ?? "transport.message.received",
                    "payload": payload?["payload"] as Any,
                    "timestamp": frame["timestamp"] as? Int ?? self.now(),
                    "transport": "tcp",
                ])
                if let messageId, !messageId.isEmpty {
                    self.sendFrame(
                        self.frame(type: "ack", sessionId: sessionId, messageId: messageId, payload: nil),
                        through: current.connection
                    )
                }
            } else if type == "close" {
                self.closeOutboundSession(sessionId: sessionId, reason: "peer-closed", emitSessionClosed: true)
                return
            }
            self.startOutboundReceiveLoop(sessionId: sessionId)
        }
    }

    func existingOutboundProbeOutcome(host: String, port: UInt16) -> ProbeOutcome? {
        let key = outboundHostPortKey(host: host, port: port)
        guard let sid = outboundHostPortToSessionId[key],
              outboundConnections[sid] != nil
        else {
            return nil
        }
        if let rec = devices.values.first(where: { $0.ipAddress == host && $0.connectable }) {
            return ProbeOutcome(
                connectable: true,
                error: nil,
                remoteDeviceId: rec.deviceId,
                remoteDisplayName: rec.name
            )
        }
        return ProbeOutcome(connectable: true, error: nil, remoteDeviceId: nil, remoteDisplayName: nil)
    }
}
