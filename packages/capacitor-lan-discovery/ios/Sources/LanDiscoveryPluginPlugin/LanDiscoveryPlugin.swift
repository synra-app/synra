import Foundation
import CryptoKit
import Network
import Darwin

@objc public class LanDiscoveryPlugin: NSObject {
    private let appId = "synra"
    private let protocolVersion = "1.0"
    private let defaultTcpPort: UInt16 = 32100
    private let defaultScanWindowMs = 15_000
    private let defaultDiscoveryTimeoutMs = 1500
    private let defaultMdnsServiceType = "_synra._tcp."
    private let udpDiscoveryPort: UInt16 = 32101
    private let udpDiscoveryMagic = "SYNRA_DISCOVERY_V1"
    private var state: String = "idle"
    private var startedAt: Int?
    private var scanWindowMs: Int = 15_000
    private var devices: [String: DeviceRecord] = [:]
    private var advertisedService: NetService?
    private var udpResponderSocket: Int32 = -1
    private var udpResponderSource: DispatchSourceRead?
    private let udpResponderQueue = DispatchQueue(label: "com.synra.lan-discovery.udp-responder")

    public override init() {
        super.init()
        startBackgroundDiscoveryServices()
    }

    deinit {
        stopBackgroundDiscoveryServices()
    }

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
        scanWindowMs: NSNumber?
    ) -> [String: Any] {
        if reset {
            devices.removeAll()
        }

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
        _ = maxProbeHosts

        let interfaceDevices = collectInterfaceDevices(includeLoopback: includeLoopback)

        var discoveredTargets: [String] = []
        if includeMdns {
            discoveredTargets = discoverByMdns(
                serviceType: mdnsServiceType ?? defaultMdnsServiceType,
                timeoutMs: discoveryTimeout
            )
        }
        if discoveredTargets.isEmpty, includeUdpFallback {
            discoveredTargets = discoverByUdp(timeoutMs: discoveryTimeout)
        }
        if !discoveredTargets.isEmpty {
            mergeDevices(collectManualDevices(discoveredTargets))
        }
        if includeManual {
            mergeDevices(collectManualDevices(manualTargets))
        }
        pruneSelfDevices(interfaceDevices)

        var result = listDevices()
        result["requestId"] = UUID().uuidString
        return result
    }

    @objc public func stopDiscovery() -> [String: Any] {
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
            let updated = device.withConnectable(outcome.connectable, outcome.error)
            devices[deviceId] = updated
        }

        return [
            "checkedAt": checkedAt,
            "port": Int(targetPort),
            "timeoutMs": targetTimeout,
            "devices": devices.values.map { $0.toDictionary() },
        ]
    }

    private func mergeDevices(_ incoming: [DeviceRecord]) {
        for device in incoming {
            if let existing = devices[device.deviceId] {
                devices[device.deviceId] = existing.merge(with: device)
            } else {
                devices[device.deviceId] = device
            }
        }
    }

    private func pruneSelfDevices(_ interfaceDevices: [DeviceRecord]) {
        let localIps = Set(interfaceDevices.map(\.ipAddress))
        guard !localIps.isEmpty else {
            return
        }
        devices = devices.filter { _, device in
            if device.source == "manual" {
                return true
            }
            return !localIps.contains(device.ipAddress)
        }
    }

    private func collectInterfaceDevices(includeLoopback: Bool) -> [DeviceRecord] {
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

    private func collectManualDevices(_ manualTargets: [String]) -> [DeviceRecord] {
        var result: [DeviceRecord] = []
        var index = 1
        for target in manualTargets {
            let trimmed = target.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty {
                continue
            }

            result.append(DeviceRecord(
                deviceId: hashDeviceId("manual:\(trimmed)"),
                name: "Manual Target \(index)",
                ipAddress: trimmed,
                source: "manual",
                connectable: false,
                connectCheckAt: nil,
                connectCheckError: nil,
                discoveredAt: now(),
                lastSeenAt: now()
            ))
            index += 1
        }
        return result
    }

    @objc public func startBackgroundDiscoveryServices() {
        startMdnsAdvertisement()
        startUdpDiscoveryResponder()
    }

    @objc public func stopBackgroundDiscoveryServices() {
        stopMdnsAdvertisement()
        stopUdpDiscoveryResponder()
    }

    private func startMdnsAdvertisement() {
        if advertisedService != nil {
            return
        }
        let serviceName = "synra-\(UUID().uuidString.prefix(8))"
        let service = NetService(
            domain: "local.",
            type: defaultMdnsServiceType,
            name: serviceName,
            port: Int32(defaultTcpPort)
        )
        service.publish()
        advertisedService = service
    }

    private func stopMdnsAdvertisement() {
        advertisedService?.stop()
        advertisedService = nil
    }

    private func discoverByMdns(serviceType: String, timeoutMs: Int) -> [String] {
        let normalized = normalizeMdnsType(serviceType)

        // NetServiceBrowser delivers callbacks on the thread that started the search; that thread's
        // run loop must run. Never block it with Thread.sleep (common Capacitor path is main queue).
        let runBrowse: () -> [String] = {
            let collector = MdnsCollector()
            collector.start(serviceType: normalized, timeoutMs: timeoutMs)
            return collector.collectedAddresses()
        }

        if Thread.isMainThread {
            return runBrowse()
        }
        var addresses: [String] = []
        DispatchQueue.main.sync {
            addresses = runBrowse()
        }
        return addresses
    }

    private func normalizeMdnsType(_ serviceType: String) -> String {
        let trimmed = serviceType.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return defaultMdnsServiceType
        }
        return trimmed.hasSuffix(".") ? trimmed : "\(trimmed)."
    }

    /// IPv4 directed broadcast addresses for each active interface (iOS often rejects 255.255.255.255 with EHOSTUNREACH).
    private func ipv4DirectedBroadcastDestinations() -> [String] {
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

    private func discoverByUdp(timeoutMs: Int) -> [String] {
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

    private func startUdpDiscoveryResponder() {
        if udpResponderSocket >= 0 {
            return
        }
        let socketFd = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        guard socketFd >= 0 else {
            return
        }
        var reuseFlag: Int32 = 1
        _ = setsockopt(
            socketFd,
            SOL_SOCKET,
            SO_REUSEADDR,
            &reuseFlag,
            socklen_t(MemoryLayout<Int32>.size)
        )
        var bindAddress = sockaddr_in()
        bindAddress.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        bindAddress.sin_family = sa_family_t(AF_INET)
        bindAddress.sin_port = CFSwapInt16HostToBig(udpDiscoveryPort)
        bindAddress.sin_addr = in_addr(s_addr: INADDR_ANY.bigEndian)
        let bindResult = withUnsafePointer(to: &bindAddress) { bindPointer in
            bindPointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
                bind(
                    socketFd,
                    sockaddrPointer,
                    socklen_t(MemoryLayout<sockaddr_in>.size)
                )
            }
        }
        guard bindResult == 0 else {
            close(socketFd)
            return
        }
        udpResponderSocket = socketFd
        let source = DispatchSource.makeReadSource(fileDescriptor: socketFd, queue: udpResponderQueue)
        source.setEventHandler { [weak self] in
            self?.handleUdpResponderRead(socketFd: socketFd)
        }
        source.setCancelHandler {
            close(socketFd)
        }
        udpResponderSource = source
        source.resume()
    }

    private func stopUdpDiscoveryResponder() {
        udpResponderSource?.cancel()
        udpResponderSource = nil
        udpResponderSocket = -1
    }

    private func handleUdpResponderRead(socketFd: Int32) {
        var buffer = [UInt8](repeating: 0, count: 256)
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
        guard receivedBytes > 0 else {
            return
        }
        let payload = String(decoding: buffer.prefix(Int(receivedBytes)), as: UTF8.self).trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        guard payload == udpDiscoveryMagic else {
            return
        }
        let responseData = try? JSONSerialization.data(
            withJSONObject: [
                "appId": appId,
                "protocolVersion": protocolVersion,
                "port": Int(defaultTcpPort),
            ]
        )
        guard let responseData else {
            return
        }
        responseData.withUnsafeBytes { bytes in
            guard let rawPointer = bytes.baseAddress else {
                return
            }
            withUnsafePointer(to: &source) { sourcePointer in
                sourcePointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
                    _ = sendto(
                        socketFd,
                        rawPointer,
                        bytes.count,
                        0,
                        sockaddrPointer,
                        sourceLength
                    )
                }
            }
        }
    }

    private func now() -> Int {
        Int(Date().timeIntervalSince1970 * 1000)
    }

    private func hashDeviceId(_ value: String) -> String {
        let digest = Insecure.SHA1.hash(data: Data(value.utf8))
        let prefix = digest.map { String(format: "%02x", $0) }.joined().prefix(12)
        return "device-\(prefix)"
    }

    private func probeDevice(host: String, port: UInt16, timeoutMs: Int) -> ProbeOutcome {
        guard let endpointPort = NWEndpoint.Port(rawValue: port) else {
            return ProbeOutcome(connectable: false, error: "INVALID_PORT")
        }

        let connection = NWConnection(host: NWEndpoint.Host(host), port: endpointPort, using: .tcp)
        let semaphore = DispatchSemaphore(value: 0)
        var outcome = ProbeOutcome(connectable: false, error: "PROBE_FAILED")
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
                        payload: nil
                    ),
                    through: connection
                )
                self.receiveSingleFrame(through: connection) { frame in
                    if let frame, frame["type"] as? String == "helloAck", frame["appId"] as? String == "synra" {
                        outcome = ProbeOutcome(connectable: true, error: nil)
                    } else {
                        outcome = ProbeOutcome(connectable: false, error: "HELLO_ACK_INVALID")
                    }
                    semaphore.signal()
                }
            case .failed(let error):
                outcome = ProbeOutcome(connectable: false, error: error.localizedDescription)
                semaphore.signal()
            default:
                break
            }
        }
        connection.start(queue: .global(qos: .userInitiated))
        _ = semaphore.wait(timeout: .now() + .milliseconds(timeoutMs))
        connection.cancel()
        if outcome.connectable {
            return outcome
        }
        if outcome.error == "PROBE_FAILED" {
            return ProbeOutcome(connectable: false, error: "PROBE_TIMEOUT")
        }
        return outcome
    }

    private func frame(type: String, sessionId: String, messageId: String?, payload: Any?) -> [String: Any] {
        var base: [String: Any] = [
            "version": "1.0",
            "type": type,
            "sessionId": sessionId,
            "timestamp": now(),
            "appId": "synra",
            "protocolVersion": "1.0",
            "capabilities": ["message"],
        ]
        if let messageId {
            base["messageId"] = messageId
        }
        if let payload {
            base["payload"] = payload
        }
        return base
    }

    private func sendFrame(_ frame: [String: Any], through target: NWConnection) {
        guard let payload = try? JSONSerialization.data(withJSONObject: frame) else {
            return
        }
        var length = UInt32(payload.count).bigEndian
        let header = Data(bytes: &length, count: MemoryLayout<UInt32>.size)
        let packet = header + payload
        target.send(content: packet, completion: .contentProcessed({ _ in }))
    }

    private func receiveSingleFrame(
        through target: NWConnection,
        completion: @escaping ([String: Any]?) -> Void
    ) {
        target.receive(minimumIncompleteLength: 4, maximumLength: 4) { header, _, _, _ in
            guard
                let header,
                header.count == 4
            else {
                completion(nil)
                return
            }

            let length = header.withUnsafeBytes { pointer -> UInt32 in
                return pointer.load(as: UInt32.self).bigEndian
            }

            target.receive(minimumIncompleteLength: Int(length), maximumLength: Int(length)) {
                payload, _, _, _ in
                guard
                    let payload,
                    let object = try? JSONSerialization.jsonObject(with: payload) as? [String: Any]
                else {
                    completion(nil)
                    return
                }
                completion(object)
            }
        }
    }
}

private final class MdnsCollector: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
    private let browser = NetServiceBrowser()
    private var addresses = Set<String>()
    private let accessQueue = DispatchQueue(label: "com.synra.lan-discovery.mdns-collector")
    /// NetService must be retained until resolve finishes; otherwise resolution never completes.
    private var pendingResolutions: [NetService] = []
    private var lastResolveTimeout: Int = 5

    override init() {
        super.init()
        browser.delegate = self
    }

    func start(serviceType: String, timeoutMs: Int) {
        let browseSeconds = Double(max(timeoutMs, 200)) / 1000.0
        let resolveTimeout = max(3, Int(browseSeconds.rounded(.up)) + 2)
        lastResolveTimeout = resolveTimeout
        // Run loop must cover browse time plus in-flight resolves (can finish after last didFind).
        let totalRunSeconds = browseSeconds + Double(resolveTimeout) + 0.5
        browser.searchForServices(ofType: serviceType, inDomain: "local.")
        // Pump the current run loop so NetServiceBrowser / NetService delegate callbacks fire.
        let limitDate = Date().addingTimeInterval(totalRunSeconds)
        RunLoop.current.run(until: limitDate)
        browser.stop()
        pendingResolutions.removeAll()
    }

    func collectedAddresses() -> [String] {
        accessQueue.sync {
            Array(addresses)
        }
    }

    func netServiceBrowser(
        _ browser: NetServiceBrowser,
        didFind service: NetService,
        moreComing: Bool
    ) {
        pendingResolutions.append(service)
        service.delegate = self
        service.resolve(withTimeout: TimeInterval(lastResolveTimeout))
    }

    private func releasePending(_ sender: NetService) {
        pendingResolutions.removeAll { ObjectIdentifier($0) == ObjectIdentifier(sender) }
    }

    func netService(_ sender: NetService, didNotResolve errorDict: [String: NSNumber]) {
        releasePending(sender)
    }

    func netServiceDidResolveAddress(_ sender: NetService) {
        releasePending(sender)
        guard let rawAddresses = sender.addresses else {
            return
        }
        for rawAddress in rawAddresses {
            guard
                let address = rawAddress.withUnsafeBytes({ pointer -> String? in
                    guard let sockaddrPointer = pointer.bindMemory(to: sockaddr.self).baseAddress else {
                        return nil
                    }
                    if sockaddrPointer.pointee.sa_family != sa_family_t(AF_INET) {
                        return nil
                    }
                    let inetPointer = UnsafeRawPointer(sockaddrPointer).assumingMemoryBound(
                        to: sockaddr_in.self
                    )
                    var inAddr = inetPointer.pointee.sin_addr
                    var buffer = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
                    guard
                        inet_ntop(
                            AF_INET,
                            &inAddr,
                            &buffer,
                            socklen_t(INET_ADDRSTRLEN)
                        ) != nil
                    else {
                        return nil
                    }
                    return String(cString: buffer)
                }),
                !address.isEmpty
            else {
                continue
            }
            accessQueue.async { [weak self] in
                self?.addresses.insert(address)
            }
        }
    }
}

private struct DeviceRecord {
    let deviceId: String
    let name: String
    let ipAddress: String
    let source: String
    let connectable: Bool
    let connectCheckAt: Int?
    let connectCheckError: String?
    let discoveredAt: Int
    let lastSeenAt: Int

    init(
        deviceId: String,
        name: String,
        ipAddress: String,
        source: String,
        connectable: Bool,
        connectCheckAt: Int?,
        connectCheckError: String?,
        discoveredAt: Int,
        lastSeenAt: Int
    ) {
        self.deviceId = deviceId
        self.name = name
        self.ipAddress = ipAddress
        self.source = source
        self.connectable = connectable
        self.connectCheckAt = connectCheckAt
        self.connectCheckError = connectCheckError
        self.discoveredAt = discoveredAt
        self.lastSeenAt = lastSeenAt
    }

    func merge(with incoming: DeviceRecord) -> DeviceRecord {
        DeviceRecord(
            deviceId: deviceId,
            name: incoming.name,
            ipAddress: incoming.ipAddress,
            source: incoming.source,
            connectable: incoming.connectable,
            connectCheckAt: incoming.connectCheckAt,
            connectCheckError: incoming.connectCheckError,
            discoveredAt: discoveredAt,
            lastSeenAt: Int(Date().timeIntervalSince1970 * 1000)
        )
    }

    func withConnectable(_ value: Bool, _ error: String?) -> DeviceRecord {
        DeviceRecord(
            deviceId: deviceId,
            name: name,
            ipAddress: ipAddress,
            source: source,
            connectable: value,
            connectCheckAt: Int(Date().timeIntervalSince1970 * 1000),
            connectCheckError: error,
            discoveredAt: discoveredAt,
            lastSeenAt: Int(Date().timeIntervalSince1970 * 1000)
        )
    }

    init?(
        dictionary: [String: Any]
    ) {
        guard
            let deviceId = dictionary["deviceId"] as? String,
            let name = dictionary["name"] as? String,
            let ipAddress = dictionary["ipAddress"] as? String,
            let source = dictionary["source"] as? String,
            let connectable = dictionary["connectable"] as? Bool,
            let discoveredAt = dictionary["discoveredAt"] as? Int,
            let lastSeenAt = dictionary["lastSeenAt"] as? Int
        else {
            return nil
        }
        self.deviceId = deviceId
        self.name = name
        self.ipAddress = ipAddress
        self.source = source
        self.connectable = connectable
        self.connectCheckAt = dictionary["connectCheckAt"] as? Int
        self.connectCheckError = dictionary["connectCheckError"] as? String
        self.discoveredAt = discoveredAt
        self.lastSeenAt = lastSeenAt
    }

    func toDictionary() -> [String: Any] {
        [
            "deviceId": deviceId,
            "name": name,
            "ipAddress": ipAddress,
            "source": source,
            "connectable": connectable,
            "connectCheckAt": connectCheckAt as Any,
            "connectCheckError": connectCheckError as Any,
            "discoveredAt": discoveredAt,
            "lastSeenAt": lastSeenAt,
        ]
    }
}

private struct ProbeOutcome {
    let connectable: Bool
    let error: String?
}

