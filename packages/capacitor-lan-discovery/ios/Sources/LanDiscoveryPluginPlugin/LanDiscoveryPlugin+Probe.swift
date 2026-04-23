import Foundation
import Network

extension LanDiscoveryPlugin {
    func probeDevice(host: String, port: UInt16, timeoutMs: Int) -> ProbeOutcome {
        guard let endpointPort = NWEndpoint.Port(rawValue: port) else {
            return ProbeOutcome(connectable: false, error: "INVALID_PORT", remoteDeviceId: nil, remoteDisplayName: nil)
        }

        let connection = NWConnection(host: NWEndpoint.Host(host), port: endpointPort, using: .tcp)
        let semaphore = DispatchSemaphore(value: 0)
        var outcome = ProbeOutcome(connectable: false, error: "PROBE_FAILED", remoteDeviceId: nil, remoteDisplayName: nil)
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
                            } else {
                                let ackName = (payload?["displayName"] as? String)?
                                    .trimmingCharacters(in: .whitespacesAndNewlines)
                                outcome = ProbeOutcome(
                                    connectable: true,
                                    error: nil,
                                    remoteDeviceId: trimmedRemote.isEmpty ? nil : canonRemote,
                                    remoteDisplayName: (ackName?.isEmpty == false) ? ackName : nil
                                )
                            }
                        } else {
                            outcome = ProbeOutcome(
                                connectable: false,
                                error: "HELLO_ACK_INVALID",
                                remoteDeviceId: nil,
                                remoteDisplayName: nil
                            )
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
        // Match Android-style budget: connect and read each use `timeoutMs`; one NWConnection wait
        // covers handshake + send + recv, so allow roughly 2× here.
        let probeWaitMs = max(1, timeoutMs * 2)
        _ = semaphore.wait(timeout: .now() + .milliseconds(probeWaitMs))
        connection.cancel()
        if outcome.connectable {
            return outcome
        }
        if outcome.error == "PROBE_FAILED" {
            return ProbeOutcome(connectable: false, error: "PROBE_TIMEOUT", remoteDeviceId: nil, remoteDisplayName: nil)
        }
        return outcome
    }
}
