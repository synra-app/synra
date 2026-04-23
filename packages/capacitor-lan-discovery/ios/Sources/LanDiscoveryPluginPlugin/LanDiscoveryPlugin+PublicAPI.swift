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

        var candidateIps: [String] = []
        var manualHosts = Set<String>()
        if includeMdns {
            candidateIps.append(contentsOf: discoverByMdns(
                serviceType: mdnsServiceType ?? defaultMdnsServiceType,
                timeoutMs: discoveryTimeout
            ))
        }
        if isHybrid, enableProbeFallback {
            candidateIps.append(contentsOf: discoverByUdp(timeoutMs: discoveryTimeout))
        }
        if includeManual {
            for raw in manualTargets {
                let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                if !t.isEmpty {
                    candidateIps.append(t)
                    manualHosts.insert(t)
                }
            }
        }

        var uniqueCandidates = Self.orderedUniqueIpv4Addresses(candidateIps)
        if let cap = maxProbeHosts?.intValue, cap > 0, uniqueCandidates.count > cap {
            uniqueCandidates = Array(uniqueCandidates.prefix(cap))
        }
        uniqueCandidates = pruneSelfCandidateIps(uniqueCandidates, scanIncludeLoopback: includeLoopback)

        let targetPort = Int(probePort?.uint16Value ?? defaultTcpPort)
        populateCandidateDevicesFromIps(ips: uniqueCandidates, port: targetPort, manualHosts: manualHosts)
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
