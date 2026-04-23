import Foundation
import Network

extension LanDiscoveryPlugin {
    func probeDevice(host: String, port: UInt16, timeoutMs: Int) -> ProbeOutcome {
        guard let endpointPort = NWEndpoint.Port(rawValue: port) else {
            return ProbeOutcome(connectable: false, error: "INVALID_PORT", remoteDeviceId: nil, remoteDisplayName: nil)
        }

        if let existing = existingOutboundProbeOutcome(host: host, port: port) {
            return existing
        }

        let connection = NWConnection(host: NWEndpoint.Host(host), port: endpointPort, using: .tcp)
        let semaphore = DispatchSemaphore(value: 0)
        var outcome = ProbeOutcome(connectable: false, error: "PROBE_FAILED", remoteDeviceId: nil, remoteDisplayName: nil)
        let outgoingSessionId = UUID().uuidString
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
                        sessionId: outgoingSessionId,
                        messageId: nil,
                        payload: {
                            var probeHello: [String: Any] = [
                                "sourceDeviceId": self.localDeviceUuid(),
                                "probe": true,
                                "displayName": self.localSynraDisplayName(),
                            ]
                            if let selfIp = self.primarySourceHostIpv4(), !selfIp.isEmpty {
                                probeHello["sourceHostIp"] = selfIp
                            }
                            return probeHello
                        }()
                    ),
                    through: connection
                ) {
                    self.receiveSingleFrame(through: connection) { frame in
                        if let frame, frame["type"] as? String == "helloAck", frame["appId"] as? String == "synra" {
                            let payload = frame["payload"] as? [String: Any]
                            let remote = payload?["sourceDeviceId"] as? String
                            let trimmedRemote = remote?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                            let localId = self.localDeviceUuid()
                            let canonRemote = self.canonicalLanDeviceId(fromWireSourceDeviceId: trimmedRemote)
                            let canonLocal = self.canonicalLanDeviceId(fromWireSourceDeviceId: localId)
                            if !trimmedRemote.isEmpty, canonRemote == canonLocal {
                                let ackName = (payload?["displayName"] as? String)?
                                    .trimmingCharacters(in: .whitespacesAndNewlines)
                                outcome = ProbeOutcome(
                                    connectable: false,
                                    error: "SELF_DEVICE",
                                    remoteDeviceId: nil,
                                    remoteDisplayName: (ackName?.isEmpty == false) ? ackName : nil
                                )
                                connection.cancel()
                            } else {
                                let ackName = (payload?["displayName"] as? String)?
                                    .trimmingCharacters(in: .whitespacesAndNewlines)
                                if trimmedRemote.isEmpty {
                                    outcome = ProbeOutcome(
                                        connectable: false,
                                        error: "MISSING_REMOTE_DEVICE_ID",
                                        remoteDeviceId: nil,
                                        remoteDisplayName: nil
                                    )
                                    connection.cancel()
                                } else {
                                    outcome = ProbeOutcome(
                                        connectable: true,
                                        error: nil,
                                        remoteDeviceId: canonRemote,
                                        remoteDisplayName: (ackName?.isEmpty == false) ? ackName : nil
                                    )
                                    let display =
                                        (ackName?.isEmpty == false) ? (ackName ?? "") : self.fallbackPeerDisplayName(
                                            forCanonicalDeviceId: canonRemote
                                        )
                                    self.finalizeOutboundSynraSession(
                                        connection: connection,
                                        host: host,
                                        port: port,
                                        outgoingSessionId: outgoingSessionId,
                                        canonRemote: canonRemote,
                                        displayName: display,
                                        helloAckPayload: payload
                                    )
                                }
                            }
                        } else {
                            outcome = ProbeOutcome(
                                connectable: false,
                                error: "HELLO_ACK_INVALID",
                                remoteDeviceId: nil,
                                remoteDisplayName: nil
                            )
                            connection.cancel()
                        }
                        semaphore.signal()
                    }
                }
            case .failed(let error):
                outcome = ProbeOutcome(
                    connectable: false,
                    error: error.localizedDescription,
                    remoteDeviceId: nil,
                    remoteDisplayName: nil
                )
                semaphore.signal()
            default:
                break
            }
        }
        connection.start(queue: .global(qos: .userInitiated))
        let probeWaitMs = max(1, timeoutMs * 2)
        _ = semaphore.wait(timeout: .now() + .milliseconds(probeWaitMs))
        if outcome.connectable {
            return outcome
        }
        if outcome.error == "SELF_DEVICE" {
            return outcome
        }
        if outcome.error == "PROBE_FAILED" {
            connection.cancel()
            return ProbeOutcome(connectable: false, error: "PROBE_TIMEOUT", remoteDeviceId: nil, remoteDisplayName: nil)
        }
        if !outcome.connectable {
            connection.cancel()
        }
        return outcome
    }
}
