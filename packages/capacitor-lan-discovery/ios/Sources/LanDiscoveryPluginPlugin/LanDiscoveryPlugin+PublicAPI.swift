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
        let includeUdpFallback = mode == "hybrid"
        // Match Android: include manual targets whenever mode is not "none"
        let includeManual = mode != "none"
        let discoveryTimeout = max(200, discoveryTimeoutMs?.intValue ?? defaultDiscoveryTimeoutMs)
        _ = enableProbeFallback
        _ = subnetCidrs

        var candidateIps: [String] = []
        if includeMdns {
            candidateIps.append(contentsOf: discoverByMdns(
                serviceType: mdnsServiceType ?? defaultMdnsServiceType,
                timeoutMs: discoveryTimeout
            ))
        }
        if candidateIps.isEmpty, includeUdpFallback {
            candidateIps.append(contentsOf: discoverByUdp(timeoutMs: discoveryTimeout))
        }
        if includeManual {
            for raw in manualTargets {
                let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                if !t.isEmpty {
                    candidateIps.append(t)
                }
            }
        }

        var uniqueCandidates = Self.orderedUniqueIpv4Addresses(candidateIps)
        if let cap = maxProbeHosts?.intValue, cap > 0, uniqueCandidates.count > cap {
            uniqueCandidates = Array(uniqueCandidates.prefix(cap))
        }
        uniqueCandidates = pruneSelfCandidateIps(uniqueCandidates, scanIncludeLoopback: includeLoopback)

        let targetPort = probePort?.uint16Value ?? defaultTcpPort
        let targetProbeTimeout = max(200, probeTimeoutMs?.intValue ?? defaultDiscoveryTimeoutMs)
        populateDevicesFromSynraProbes(candidateIps: uniqueCandidates, port: targetPort, timeoutMs: targetProbeTimeout)
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

    @objc public func probeConnectable(port: NSNumber?, timeoutMs: NSNumber?) -> [String: Any] {
        let targetPort = port?.uint16Value ?? 32100
        let targetTimeout = timeoutMs?.intValue ?? 1500
        let checkedAt = now()
        for (deviceId, device) in devices {
            let outcome = probeDevice(host: device.ipAddress, port: targetPort, timeoutMs: targetTimeout)
            var updated = device.withConnectable(outcome.connectable, outcome.error)
            let canonRemote = outcome.remoteDeviceId.map { canonicalLanDeviceId(fromWireSourceDeviceId: $0) } ?? ""
            let canonExisting = canonicalLanDeviceId(fromWireSourceDeviceId: device.deviceId)
            if !canonRemote.isEmpty, canonRemote != canonExisting {
                devices.removeValue(forKey: deviceId)
                let trimmedDisplay = outcome.remoteDisplayName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                let nextName: String
                if !trimmedDisplay.isEmpty {
                    nextName = trimmedDisplay
                } else {
                    nextName = updated.name
                }
                updated = DeviceRecord(
                    deviceId: canonRemote,
                    name: nextName,
                    ipAddress: updated.ipAddress,
                    source: updated.source,
                    connectable: updated.connectable,
                    connectCheckAt: updated.connectCheckAt,
                    connectCheckError: updated.connectCheckError,
                    discoveredAt: updated.discoveredAt,
                    lastSeenAt: updated.lastSeenAt
                )
            } else if let dn = outcome.remoteDisplayName?.trimmingCharacters(in: .whitespacesAndNewlines),
                      !dn.isEmpty
            {
                updated = updated.withName(dn)
            }
            devices[updated.deviceId] = updated
        }

        return [
            "checkedAt": checkedAt,
            "port": Int(targetPort),
            "timeoutMs": targetTimeout,
            "devices": devices.values.map { $0.toDictionary() },
        ]
    }

    @objc public func sendMessage(
        sessionId: String,
        messageType: String,
        payload: Any,
        messageId: String?
    ) -> [String: Any]? {
        guard let context = inboundConnections.first(where: { $0.value.sessionId == sessionId })?.value else {
            return nil
        }
        let targetMessageId = messageId ?? UUID().uuidString
        let envelope: [String: Any] = [
            "messageType": messageType,
            "payload": payload,
        ]
        sendFrame(
            frame(type: "message", sessionId: sessionId, messageId: targetMessageId, payload: envelope),
            through: context.connection
        )
        return [
            "success": true,
            "sessionId": sessionId,
            "messageId": targetMessageId,
            "transport": "tcp",
        ]
    }

    @objc public func closeSession(sessionId: String) -> [String: Any] {
        guard let connectionId = inboundConnections.first(where: { $0.value.sessionId == sessionId })?.key else {
            return [
                "success": true,
                "sessionId": sessionId,
                "transport": "tcp",
            ]
        }
        closeInboundConnection(connectionId: connectionId, reason: "closed-by-host", emitSessionClosed: true)
        return [
            "success": true,
            "sessionId": sessionId,
            "transport": "tcp",
        ]
    }

    @objc public func startBackgroundDiscoveryServices() {
        startMdnsAdvertisement()
        startUdpDiscoveryResponder()
        startTcpServer()
    }

    @objc public func stopBackgroundDiscoveryServices() {
        stopTcpServer()
        stopMdnsAdvertisement()
        stopUdpDiscoveryResponder()
    }
}
