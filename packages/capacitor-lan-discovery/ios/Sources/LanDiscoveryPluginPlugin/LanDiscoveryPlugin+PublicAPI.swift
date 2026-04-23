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
            closeAllOutboundSessions()
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

    @objc public func ensureOutboundSession(
        host: String,
        port: NSNumber,
        timeoutMs: NSNumber?
    ) -> [String: Any] {
        let trimmed = host.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return ["error": "INVALID_HOST"]
        }
        let p = port.uint16Value
        let t = max(200, timeoutMs?.intValue ?? defaultDiscoveryTimeoutMs)
        _ = probeDevice(host: trimmed, port: p, timeoutMs: t)
        let key = outboundHostPortKey(host: trimmed, port: p)
        if let sid = outboundHostPortToSessionId[key], outboundConnections[sid] != nil {
            return [
                "sessionId": sid,
                "state": "open",
                "transport": "tcp",
            ]
        }
        return ["error": "ENSURE_FAILED", "host": trimmed, "port": Int(p)]
    }

    @objc public func sendMessage(
        sessionId: String,
        messageType: String,
        payload: Any,
        messageId: String?
    ) -> [String: Any]? {
        let targetMessageId = messageId ?? UUID().uuidString
        let envelope: [String: Any] = [
            "messageType": messageType,
            "payload": payload,
        ]
        let frameToSend = frame(type: "message", sessionId: sessionId, messageId: targetMessageId, payload: envelope)
        if let outbound = outboundConnections[sessionId] {
            sendFrame(frameToSend, through: outbound.connection)
            return [
                "success": true,
                "sessionId": sessionId,
                "messageId": targetMessageId,
                "transport": "tcp",
            ]
        }
        guard let context = inboundConnections.first(where: { $0.value.sessionId == sessionId })?.value else {
            return nil
        }
        sendFrame(frameToSend, through: context.connection)
        return [
            "success": true,
            "sessionId": sessionId,
            "messageId": targetMessageId,
            "transport": "tcp",
        ]
    }

    @objc public func closeSession(sessionId: String) -> [String: Any] {
        if outboundConnections[sessionId] != nil {
            closeOutboundSession(sessionId: sessionId, reason: "closed-by-host", emitSessionClosed: true)
            return [
                "success": true,
                "sessionId": sessionId,
                "transport": "tcp",
            ]
        }
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
        closeAllOutboundSessions()
        stopTcpServer()
        stopMdnsAdvertisement()
        stopUdpDiscoveryResponder()
    }
}
