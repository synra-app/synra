import Foundation

extension LanDiscoveryPlugin {
    @objc public func startDiscovery(
        includeLoopback: Bool,
        manualTargets: [String],
        enableProbeFallback: Bool,
        discoveryMode: String?,
        mdnsServiceType: String?,
        discoveryTimeoutMs: NSNumber?,
        subnetCidrs: [String],
        maxProbeHosts: NSNumber?,
        reset: Bool,
        scanWindowMs: NSNumber?,
        probePort: NSNumber?,
        probeTimeoutMs: NSNumber?
    ) -> [String: Any] {
        if reset {
            devices.removeAll()
        }

        startBackgroundDiscoveryServices()

        state = "scanning"
        startedAt = now()
        self.scanWindowMs = scanWindowMs?.intValue ?? defaultScanWindowMs
        let mode = discoveryMode ?? "hybrid"
        let includeMdns = mode == "hybrid" || mode == "mdns"
        let isHybrid = mode == "hybrid"
        // Match Android: include manual targets whenever mode is not "none"
        let includeManual = mode != "none"
        let discoveryTimeout = max(200, discoveryTimeoutMs?.intValue ?? defaultDiscoveryTimeoutMs)
        _ = subnetCidrs

        var candidateCandidates: [DiscoveryCandidate] = []
        var manualHosts = Set<String>()
        if includeMdns {
            candidateCandidates.append(contentsOf: discoverByMdns(
                serviceType: mdnsServiceType ?? defaultMdnsServiceType,
                timeoutMs: discoveryTimeout
            ))
        }
        if isHybrid, enableProbeFallback {
            candidateCandidates.append(contentsOf: discoverByUdp(timeoutMs: discoveryTimeout))
        }
        if includeManual {
            for raw in manualTargets {
                let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                if !t.isEmpty {
                    candidateCandidates.append(DiscoveryCandidate(host: t, sourceDeviceId: nil))
                    manualHosts.insert(t)
                }
            }
        }

        var dedupedByHost: [String: DiscoveryCandidate] = [:]
        for candidate in candidateCandidates {
            let host = candidate.host.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !host.isEmpty else {
                continue
            }
            if let existing = dedupedByHost[host] {
                let existingSource = existing.sourceDeviceId?.trimmingCharacters(
                    in: .whitespacesAndNewlines
                ) ?? ""
                let incomingSource = candidate.sourceDeviceId?.trimmingCharacters(
                    in: .whitespacesAndNewlines
                ) ?? ""
                if existingSource.isEmpty, !incomingSource.isEmpty {
                    dedupedByHost[host] = candidate
                }
                continue
            }
            dedupedByHost[host] = candidate
        }
        var uniqueCandidates = Array(dedupedByHost.values)
        if let cap = maxProbeHosts?.intValue, cap > 0, uniqueCandidates.count > cap {
            uniqueCandidates = Array(uniqueCandidates.prefix(cap))
        }
        let filteredHosts = Set(
            pruneSelfCandidateIps(
                uniqueCandidates.map(\.host),
                scanIncludeLoopback: includeLoopback
            )
        )
        uniqueCandidates = uniqueCandidates.filter { filteredHosts.contains($0.host) }

        let targetPort = Int(probePort?.uint16Value ?? defaultTcpPort)
        populateCandidateDevices(candidates: uniqueCandidates, port: targetPort, manualHosts: manualHosts)
        pruneSelfDevices(scanIncludeLoopback: includeLoopback)

        var result = listDevices()
        result["requestId"] = UUID().uuidString
        return result
    }

    @objc public func stopDiscovery() -> [String: Any] {
        stopBackgroundDiscoveryServices()
        state = "idle"
        return ["success": true]
    }

    @objc public func listDevices() -> [String: Any] {
        var result: [String: Any] = [
            "state": state,
            "scanWindowMs": scanWindowMs,
            "devices": devices.values.map { $0.toDictionary() },
        ]
        if let startedAt {
            result["startedAt"] = startedAt
        }
        return result
    }

    @objc public func updateDeviceConnectable(
        deviceId: String,
        connectable: Bool,
        connectCheckError: String?
    ) -> [String: Any]? {
        guard let selected = devices[deviceId] else {
            return nil
        }
        let updated = selected.withConnectable(connectable, connectCheckError)
        devices[deviceId] = updated
        return updated.toDictionary()
    }

    @objc public func startBackgroundDiscoveryServices() {
        startMdnsAdvertisement()
        startUdpDiscoveryResponder()
    }

    @objc public func stopBackgroundDiscoveryServices() {
        stopMdnsAdvertisement()
        stopUdpDiscoveryResponder()
    }
}
