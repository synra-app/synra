import Foundation
import Network

extension DeviceConnectionPluginCore {
    /// One-shot Synra `connect` (probe) per target; closes the socket after `connectAck` (or failure).
    public func probeSynraPeersJson(
        targets: [[String: Any]],
        timeoutMs: Int
    ) -> [[String: Any]] {
        var results: [[String: Any]] = []
        for raw in targets {
            guard
                let host = (raw["host"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
                !host.isEmpty
            else {
                continue
            }
            let portNum = (raw["port"] as? NSNumber)?.uint16Value
                ?? UInt16(truncatingIfNeeded: (raw["port"] as? Int) ?? Int(synraDefaultTcpPort))
            let wireExtras = (raw["connectWirePayload"] as? [String: Any]) ?? [:]
            results.append(
                probeSynraOnePeer(host: host, port: portNum, timeoutMs: timeoutMs, wireExtras: wireExtras)
            )
        }
        return results
    }

    private func probeSynraOnePeer(
        host: String,
        port: UInt16,
        timeoutMs: Int,
        wireExtras: [String: Any]
    ) -> [String: Any] {
        var base: [String: Any] = [
            "host": host,
            "port": Int(port),
            "ok": false,
        ]
        guard let endpointPort = NWEndpoint.Port(rawValue: port) else {
            base["error"] = "INVALID_PORT"
            return base
        }
        let connection = NWConnection(host: NWEndpoint.Host(host), port: endpointPort, using: .tcp)
        let semaphore = DispatchSemaphore(value: 0)
        var finished = false
        let connectRequestId = UUID().uuidString
        connection.stateUpdateHandler = { [weak self] state in
            guard let self else {
                semaphore.signal()
                return
            }
            switch state {
            case .ready:
                var probeConnect: [String: Any] = [
                    "sourceDeviceId": self.localDeviceUuid(),
                    "probe": true,
                    "displayName": self.localSynraDisplayName(),
                ]
                for (k, v) in wireExtras {
                    probeConnect[k] = v
                }
                if let selfIp = self.primarySourceHostIpv4(), !selfIp.isEmpty {
                    probeConnect["sourceHostIp"] = selfIp
                }
                let connectFrame = self.synraLanFrame(
                    type: "connect",
                    requestId: connectRequestId,
                    messageId: nil,
                    sourceDeviceId: self.localDeviceUuid(),
                    targetDeviceId: nil,
                    replyToRequestId: nil,
                    payload: probeConnect,
                    error: nil
                )
                self.sendFrame(connectFrame, through: connection) {
                    self.receiveSingleFrame(through: connection) { frame in
                    defer {
                        connection.cancel()
                        finished = true
                        semaphore.signal()
                    }
                    guard
                        let frame,
                        frame["type"] as? String == "connectAck",
                        frame["appId"] as? String == self.appId
                    else {
                        base["error"] = "CONNECT_ACK_INVALID"
                        return
                    }
                    guard let payload = frame["payload"] as? [String: Any] else {
                        base["error"] = "MISSING_ACK_PAYLOAD"
                        return
                    }
                    base["connectAckPayload"] = payload
                    let remoteRaw = (payload["sourceDeviceId"] as? String)?
                        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                    guard !remoteRaw.isEmpty else {
                        base["error"] = "MISSING_REMOTE_DEVICE_ID"
                        return
                    }
                    let canonRemote = self.canonicalSynraDeviceId(fromWireSourceDeviceId: remoteRaw)
                    let canonLocal = self.canonicalSynraDeviceId(fromWireSourceDeviceId: self.localDeviceUuid())
                    if canonRemote == canonLocal {
                        base["error"] = "SELF_DEVICE"
                        return
                    }
                    base["ok"] = true
                    base["wireSourceDeviceId"] = canonRemote
                    let ackName = (payload["displayName"] as? String)?
                        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                    if !ackName.isEmpty {
                        base["displayName"] = ackName
                    }
                    }
                }
            case .failed(let error):
                base["error"] = error.localizedDescription
                finished = true
                semaphore.signal()
            default:
                break
            }
        }
        connection.start(queue: .global(qos: .userInitiated))
        let probeWaitMs = max(1, timeoutMs * 2)
        _ = semaphore.wait(timeout: .now() + .milliseconds(probeWaitMs))
        if !finished {
            base["error"] = "PROBE_TIMEOUT"
            connection.cancel()
        }
        return base
    }
}
