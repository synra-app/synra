import Capacitor
import DeviceConnectionPlugin
import Foundation

extension LanDiscoveryPlugin {
    /// Recursively materialize Capacitor `JSObject` (`[String: JSValue]`) for native probe wiring.
    private func synraCoerceJSValueToAny(_ value: JSValue) -> Any {
        if let s = value as? String { return s }
        if let b = value as? Bool { return b }
        if let i = value as? Int { return i }
        if let f = value as? Float { return f }
        if let d = value as? Double { return d }
        if let n = value as? NSNumber { return n }
        if value is NSNull { return NSNull() }
        if let dt = value as? Date { return dt }
        if let o = value as? JSObject {
            var dict: [String: Any] = [:]
            for (k, v) in o {
                dict[k] = synraCoerceJSValueToAny(v)
            }
            return dict
        }
        if let arr = value as? JSArray {
            return arr.map { synraCoerceJSValueToAny($0) }
        }
        return value
    }

    private func jsDict(from object: JSObject?) -> [String: Any] {
        guard let object else {
            return [:]
        }
        var out: [String: Any] = [:]
        for (key, value) in object {
            out[key] = synraCoerceJSValueToAny(value)
        }
        return out
    }

    private static func synraSplitBudget(_ budget: Int) -> (discoveryMs: Int, probeMs: Int) {
        let b = max(600, budget)
        let probeMs = min(900, max(350, Int(floor(Double(b) * 0.38))))
        let discoveryMs = max(200, b - probeMs - 80)
        return (discoveryMs, probeMs)
    }

    /// Swift-only entry (uses `JSObject` / `CAPBridgeProtocol`; not exposed to Obj-C).
    public func startDiscovery(
        includeLoopback: Bool,
        manualTargets: [String],
        enableProbeFallback: Bool,
        discoveryMode: String?,
        mdnsServiceType: String?,
        scanBudgetMs: NSNumber?,
        subnetCidrs: [String],
        maxProbeHosts: NSNumber?,
        reset: Bool,
        scanWindowMs: NSNumber?,
        probePort: NSNumber?,
        bridge: CAPBridgeProtocol?,
        probeConnectWirePayload: JSObject?
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
        let includeManual = mode != "none"
        let budget = max(600, scanBudgetMs?.intValue ?? 2200)
        let split = Self.synraSplitBudget(budget)
        let discoveryTimeout = max(200, split.discoveryMs)
        let probeTimeout = max(200, split.probeMs)
        _ = subnetCidrs

        var candidateCandidates: [DiscoveryCandidate] = []
        var manualHosts = Set<String>()
        // SYNRA-COMM::UDP_DISCOVERY::CONNECT::DISCOVERY_SCAN — mDNS and UDP run in parallel in hybrid (matches Electron orchestrator).
        if includeMdns, isHybrid, enableProbeFallback {
            var mdnsRows: [DiscoveryCandidate] = []
            var udpRows: [DiscoveryCandidate] = []
            let group = DispatchGroup()
            group.enter()
            DispatchQueue.global(qos: .userInitiated).async { [self] in
                mdnsRows = self.discoverByMdns(
                    serviceType: mdnsServiceType ?? defaultMdnsServiceType,
                    timeoutMs: discoveryTimeout
                )
                group.leave()
            }
            group.enter()
            DispatchQueue.global(qos: .userInitiated).async { [self] in
                udpRows = self.discoverByUdp(timeoutMs: discoveryTimeout)
                group.leave()
            }
            group.wait()
            candidateCandidates.append(contentsOf: mdnsRows)
            candidateCandidates.append(contentsOf: udpRows)
        } else if includeMdns {
            candidateCandidates.append(contentsOf: discoverByMdns(
                serviceType: mdnsServiceType ?? defaultMdnsServiceType,
                timeoutMs: discoveryTimeout
            ))
        } else if isHybrid, enableProbeFallback {
            candidateCandidates.append(contentsOf: discoverByUdp(timeoutMs: discoveryTimeout))
        }
        if includeManual {
            for raw in manualTargets {
                let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                if !t.isEmpty {
                    candidateCandidates.append(
                        DiscoveryCandidate(host: t, sourceDeviceId: nil, synraPort: 0)
                    )
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
                    continue
                }
                if existing.synraPort <= 0, candidate.synraPort > 0 {
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

        synraMergeProbesFromDeviceConnection(
            bridge: bridge,
            candidates: uniqueCandidates,
            manualHosts: manualHosts,
            probeTimeoutMs: probeTimeout,
            synraTcpPort: targetPort,
            connectWire: jsDict(from: probeConnectWirePayload)
        )

        var result = listDevices()
        result["requestId"] = UUID().uuidString
        return result
    }

    private func synraMergeProbesFromDeviceConnection(
        bridge: CAPBridgeProtocol?,
        candidates: [DiscoveryCandidate],
        manualHosts: Set<String>,
        probeTimeoutMs: Int,
        synraTcpPort: Int,
        connectWire: [String: Any]
    ) {
        guard let bridge else {
            return
        }
        guard let dc = bridge.plugin(withName: "DeviceConnection") as? DeviceConnectionPluginPlugin else {
            return
        }
        var targets: [[String: Any]] = []
        for c in candidates {
            let host = c.host.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !host.isEmpty else {
                continue
            }
            let sid = c.sourceDeviceId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let stable = sid.isEmpty ? host : sid
            let port = c.synraPort > 0 ? c.synraPort : synraTcpPort
            var row: [String: Any] = [
                "host": host,
                "port": port,
                "connectWirePayload": connectWire,
                "target": stable
            ]
            targets.append(row)
        }
        guard !targets.isEmpty else {
            return
        }
        let rows = dc.synra_blockingProbeForLanDiscovery(targets, probeTimeoutMs)
        let stamped = now()
        for one in rows {
            guard let ok = one["ok"] as? Bool, ok else {
                continue
            }
            guard let wire = one["wireSourceDeviceId"] as? String, !wire.isEmpty else {
                continue
            }
            let host = (one["host"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let p = (one["port"] as? Int) ?? synraTcpPort
            let stable = canonicalLanDeviceId(fromWireSourceDeviceId: wire)
            let label = host.isEmpty ? stable : host
            devices[stable] = DeviceRecord(
                deviceId: stable,
                name: label,
                ipAddress: host,
                port: p,
                source: "probe",
                connectable: true,
                connectCheckAt: stamped,
                connectCheckError: nil,
                discoveredAt: stamped,
                lastSeenAt: stamped
            )
        }
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
