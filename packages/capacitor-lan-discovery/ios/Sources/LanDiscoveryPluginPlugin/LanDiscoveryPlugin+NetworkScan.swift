import Foundation
import Network

extension LanDiscoveryPlugin {
    /// IPv4 candidates only (mDNS / UDP / manual). Synra TCP hello is performed by `DeviceConnection.probeSynraPeers` in JS.
    func populateCandidateDevicesFromIps(ips: [String], port: Int, manualHosts: Set<String>) {
        let checkedAt = now()
        for host in ips {
            let trimmed = host.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else {
                continue
            }
            let stableId = hashDeviceId("synra-candidate:\(trimmed)")
            let source: String = manualHosts.contains(trimmed) ? "manual" : "mdns"
            devices[stableId] = DeviceRecord(
                deviceId: stableId,
                name: trimmed,
                ipAddress: trimmed,
                port: port,
                source: source,
                connectable: false,
                connectCheckAt: nil,
                connectCheckError: nil,
                discoveredAt: checkedAt,
                lastSeenAt: checkedAt
            )
        }
    }

    func pruneSelfCandidateIps(_ candidates: [String], scanIncludeLoopback: Bool) -> [String] {
        let localIps = Set(collectInterfaceDevices(includeLoopback: scanIncludeLoopback).map(\.ipAddress))
        guard !localIps.isEmpty else {
            return candidates
        }
        return candidates.filter { !localIps.contains($0) }
    }

    static func orderedUniqueIpv4Addresses(_ raw: [String]) -> [String] {
        var seen = Set<String>()
        var out: [String] = []
        for s in raw {
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            if t.isEmpty {
                continue
            }
            if seen.insert(t).inserted {
                out.append(t)
            }
        }
        return out
    }

    func pruneSelfDevices(scanIncludeLoopback: Bool) {
        let localIps = Set(collectInterfaceDevices(includeLoopback: scanIncludeLoopback).map(\.ipAddress))
        guard !localIps.isEmpty else {
            return
        }
        devices = devices.filter { _, device in
            !localIps.contains(device.ipAddress)
        }
    }

    func collectInterfaceDevices(includeLoopback: Bool) -> [DeviceRecord] {
        var cursor: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&cursor) == 0, let first = cursor else {
            return []
        }
        defer { freeifaddrs(cursor) }

        let hostName = ProcessInfo.processInfo.hostName
        let host = hostName.isEmpty ? "ios-host" : hostName
        var records: [DeviceRecord] = []
        var pointer: UnsafeMutablePointer<ifaddrs>? = first
        while let current = pointer {
            let interface = current.pointee
            pointer = interface.ifa_next
            guard let address = interface.ifa_addr, address.pointee.sa_family == UInt8(AF_INET) else {
                continue
            }
            let interfaceName = String(cString: interface.ifa_name)
            let addressValue = withUnsafePointer(to: address.pointee) {
                $0.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { rebound -> String in
                    var addr = rebound.pointee.sin_addr
                    var buffer = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
                    _ = inet_ntop(AF_INET, &addr, &buffer, socklen_t(INET_ADDRSTRLEN))
                    return String(cString: buffer)
                }
            }
            let isLoopback = addressValue == "127.0.0.1"
            if isLoopback && !includeLoopback {
                continue
            }
            records.append(
                DeviceRecord(
                    deviceId: hashDeviceId("\(host):\(addressValue)"),
                    name: "\(host) (\(interfaceName))",
                    ipAddress: addressValue,
                    port: Int(defaultTcpPort),
                    source: "mdns",
                    connectable: false,
                    connectCheckAt: nil,
                    connectCheckError: nil,
                    discoveredAt: now(),
                    lastSeenAt: now()
                )
            )
        }
        return records
    }

    func primarySourceHostIpv4() -> String? {
        let records = collectInterfaceDevices(includeLoopback: false)
        let ips = records.map(\.ipAddress).filter { !$0.hasPrefix("169.254.") }.sorted()
        return ips.first ?? records.first?.ipAddress
    }

    /// Resolves `_synra._tcp` to candidate IPv4 addresses only (not devices until TCP helloAck).
    func discoverByMdns(serviceType: String, timeoutMs: Int) -> [String] {
        let normalized = normalizeMdnsType(serviceType)

        // NetServiceBrowser delivers callbacks on the thread that started the search; that thread's
        // run loop must run. Never block it with Thread.sleep (common Capacitor path is main queue).
        let runBrowse: () -> [String] = {
            let collector = MdnsCollector()
            collector.start(serviceType: normalized, timeoutMs: timeoutMs)
            return Self.orderedUniqueIpv4Addresses(collector.collectedEntries().map(\.ip))
        }

        if Thread.isMainThread {
            return runBrowse()
        }
        var ips: [String] = []
        DispatchQueue.main.sync {
            ips = runBrowse()
        }
        return ips
    }

    func normalizeMdnsType(_ serviceType: String) -> String {
        let trimmed = serviceType.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return defaultMdnsServiceType
        }
        return trimmed.hasSuffix(".") ? trimmed : "\(trimmed)."
    }

    /// IPv4 directed broadcast addresses for each active interface (iOS often rejects 255.255.255.255 with EHOSTUNREACH).
    func ipv4DirectedBroadcastDestinations() -> [String] {
        struct Pair {
            var addr: in_addr?
            var mask: in_addr?
        }
        var byName: [String: Pair] = [:]
        var cursor: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&cursor) == 0, let first = cursor else {
            return []
        }
        defer { freeifaddrs(cursor) }

        var ptr: UnsafeMutablePointer<ifaddrs>? = first
        while let ifa = ptr {
            let flags = Int32(ifa.pointee.ifa_flags)
            if (flags & IFF_UP) == 0 {
                ptr = ifa.pointee.ifa_next
                continue
            }
            let name = String(cString: ifa.pointee.ifa_name)
            if let addr = ifa.pointee.ifa_addr, addr.pointee.sa_family == UInt8(AF_INET) {
                var pair = byName[name] ?? Pair()
                let sin = UnsafeRawPointer(addr).assumingMemoryBound(to: sockaddr_in.self).pointee
                pair.addr = sin.sin_addr
                byName[name] = pair
            }
            if let netmask = ifa.pointee.ifa_netmask, netmask.pointee.sa_family == UInt8(AF_INET) {
                var pair = byName[name] ?? Pair()
                let sin = UnsafeRawPointer(netmask).assumingMemoryBound(to: sockaddr_in.self).pointee
                pair.mask = sin.sin_addr
                byName[name] = pair
            }
            ptr = ifa.pointee.ifa_next
        }

        var out: Set<String> = []
        for (_, pair) in byName {
            guard let rawAddr = pair.addr, let rawMask = pair.mask else {
                continue
            }
            // Avoid ntohl/htonl (not always visible to Swift); iOS is little-endian so byteSwapped matches NTOHL/HTONL.
            let hostAddr = rawAddr.s_addr.byteSwapped
            let hostMask = rawMask.s_addr.byteSwapped
            if hostMask == 0 {
                continue
            }
            let broadcastHost = hostAddr | ~hostMask
            var bc = in_addr(s_addr: broadcastHost.byteSwapped)
            var buffer = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
            guard inet_ntop(AF_INET, &bc, &buffer, socklen_t(INET_ADDRSTRLEN)) != nil else {
                continue
            }
            let dotted = String(cString: buffer)
            if dotted.hasPrefix("127.") {
                continue
            }
            out.insert(dotted)
        }
        return Array(out)
    }

    func discoverByUdp(timeoutMs: Int) -> [String] {
        var results = Set<String>()
        let socketFd = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        guard socketFd >= 0 else {
            return []
        }
        defer { close(socketFd) }

        var broadcastFlag: Int32 = 1
        _ = setsockopt(
            socketFd,
            SOL_SOCKET,
            SO_BROADCAST,
            &broadcastFlag,
            socklen_t(MemoryLayout<Int32>.size)
        )

        // Short per-recv timeout (matches Android); tv_usec must be < 1_000_000
        let chunkMicros = 200_000
        var receiveTimeout = timeval(tv_sec: 0, tv_usec: Int32(chunkMicros))
        _ = setsockopt(
            socketFd,
            SOL_SOCKET,
            SO_RCVTIMEO,
            &receiveTimeout,
            socklen_t(MemoryLayout<timeval>.size)
        )

        // inet_addr("255.255.255.255") is indistinguishable from INADDR_NONE on BSD; use inet_pton.
        var destinations: [String] = ["255.255.255.255"]
        destinations.append(contentsOf: ipv4DirectedBroadcastDestinations())
        var uniqueDest: [String] = []
        var seen = Set<String>()
        for d in destinations where seen.insert(d).inserted {
            uniqueDest.append(d)
        }

        let payload = Array(udpDiscoveryMagic.utf8)
        for destIp in uniqueDest {
            var destination = sockaddr_in()
            destination.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
            destination.sin_family = sa_family_t(AF_INET)
            destination.sin_port = CFSwapInt16HostToBig(udpDiscoveryPort)
            if inet_pton(AF_INET, destIp, &destination.sin_addr) != 1 {
                continue
            }
            _ = payload.withUnsafeBytes { bytes -> ssize_t in
                guard let rawPointer = bytes.baseAddress else {
                    return -1
                }
                return withUnsafePointer(to: &destination) { destinationPointer -> ssize_t in
                    destinationPointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
                        sendto(
                            socketFd,
                            rawPointer,
                            bytes.count,
                            0,
                            sockaddrPointer,
                            socklen_t(MemoryLayout<sockaddr_in>.size)
                        )
                    }
                }
            }
        }

        let deadline = Date().addingTimeInterval(Double(max(timeoutMs, 200)) / 1000.0)
        var buffer = [UInt8](repeating: 0, count: 512)
        while Date() < deadline {
            var source = sockaddr_in()
            var sourceLength = socklen_t(MemoryLayout<sockaddr_in>.size)
            let receivedBytes = withUnsafeMutablePointer(to: &source) { sourcePointer in
                sourcePointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
                    recvfrom(
                        socketFd,
                        &buffer,
                        buffer.count,
                        0,
                        sockaddrPointer,
                        &sourceLength
                    )
                }
            }
            if receivedBytes < 0 {
                continue
            }
            if receivedBytes == 0 {
                continue
            }
            let data = Data(buffer.prefix(Int(receivedBytes)))
            guard
                let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                object["appId"] as? String == appId
            else {
                continue
            }
            var addressBuffer = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
            var sourceAddress = source.sin_addr
            guard inet_ntop(AF_INET, &sourceAddress, &addressBuffer, socklen_t(INET_ADDRSTRLEN)) != nil else {
                continue
            }
            let addr = String(cString: addressBuffer)
            results.insert(addr)
        }
        return Array(results)
    }
}
