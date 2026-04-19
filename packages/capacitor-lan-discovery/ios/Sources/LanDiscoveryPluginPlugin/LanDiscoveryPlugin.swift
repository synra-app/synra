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
    private var sessionState = SessionState()
    private var connection: NWConnection?
    private var advertisedService: NetService?
    private var udpResponderSocket: Int32 = -1
    private var udpResponderSource: DispatchSourceRead?
    private let udpResponderQueue = DispatchQueue(label: "com.synra.lan-discovery.udp-responder")
    public var onMessageReceived: (([String: Any]) -> Void)?
    public var onMessageAck: (([String: Any]) -> Void)?
    public var onSessionClosed: (([String: Any]) -> Void)?
    public var onTransportError: (([String: Any]) -> Void)?

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
        let includeManual = mode != "mdns"
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

    @objc public func pairDevice(deviceId: String) -> [String: Any]? {
        guard let selected = devices[deviceId] else {
            return nil
        }

        let paired = selected.withPaired(true)
        devices[deviceId] = paired
        return [
            "success": true,
            "device": paired.toDictionary(),
        ]
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

    @objc public func openSession(
        deviceId: String,
        host: String,
        port: NSNumber,
        token: String?
    ) -> [String: Any]? {
        let tcpPort = NWEndpoint.Port(rawValue: port.uint16Value)
        guard let endpointPort = tcpPort else {
            sessionState.state = "error"
            sessionState.lastError = "INVALID_PORT"
            return nil
        }

        closeSession(sessionId: nil)

        sessionState.state = "connecting"
        sessionState.deviceId = deviceId
        sessionState.host = host
        sessionState.port = Int(port.uint16Value)
        sessionState.lastError = nil

        let connection = NWConnection(host: NWEndpoint.Host(host), port: endpointPort, using: .tcp)
        self.connection = connection
        let semaphore = DispatchSemaphore(value: 0)
        var opened = false
        var openError: String?
        let generatedSessionId = UUID().uuidString

        connection.stateUpdateHandler = { [weak self] state in
            guard let self else {
                return
            }
            switch state {
            case .ready:
                let frame = self.frame(
                    type: "hello",
                    sessionId: generatedSessionId,
                    messageId: nil,
                    payload: ["token": token as Any]
                )
                self.sendFrame(frame)
                self.receiveSingleFrame { response in
                    guard let response else {
                        openError = "MISSING_HELLO_ACK"
                        semaphore.signal()
                        return
                    }
                    if response["type"] as? String != "helloAck" {
                        openError = "MISSING_HELLO_ACK"
                        semaphore.signal()
                        return
                    }
                    if response["appId"] as? String != "synra" {
                        openError = "APP_ID_MISMATCH"
                        semaphore.signal()
                        return
                    }
                    self.sessionState.state = "open"
                    self.sessionState.sessionId = (response["sessionId"] as? String) ?? generatedSessionId
                    self.sessionState.openedAt = self.now()
                    opened = true
                    self.startReceiveLoop()
                    semaphore.signal()
                }
            case .failed(let error):
                openError = error.localizedDescription
                semaphore.signal()
            default:
                break
            }
        }

        connection.start(queue: .global(qos: .userInitiated))
        let timeout = DispatchTime.now() + .milliseconds(3000)
        if semaphore.wait(timeout: timeout) == .timedOut {
            openError = "SESSION_OPEN_TIMEOUT"
        }

        if opened {
            return [
                "success": true,
                "sessionId": sessionState.sessionId ?? generatedSessionId,
                "state": sessionState.state,
            ]
        }

        sessionState.state = "error"
        sessionState.lastError = openError ?? "SESSION_OPEN_FAILED"
        connection.cancel()
        self.connection = nil
        return nil
    }

    @objc public func closeSession(sessionId: String?) -> [String: Any] {
        if let sessionId = sessionId ?? sessionState.sessionId {
            let closeFrame = frame(type: "close", sessionId: sessionId, messageId: nil, payload: nil)
            sendFrame(closeFrame)
        }
        connection?.cancel()
        connection = nil
        sessionState.state = "closed"
        sessionState.closedAt = now()
        return [
            "success": true,
            "sessionId": sessionId ?? sessionState.sessionId as Any,
        ]
    }

    @objc public func sendMessage(
        sessionId: String,
        messageType: String,
        payload: Any,
        messageId: String?
    ) -> [String: Any]? {
        guard sessionState.state == "open" else {
            sessionState.lastError = "SESSION_NOT_OPEN"
            return nil
        }

        let targetMessageId = messageId ?? UUID().uuidString
        let envelope: [String: Any] = [
            "messageType": messageType,
            "payload": payload,
        ]
        let messageFrame = frame(
            type: "message",
            sessionId: sessionId,
            messageId: targetMessageId,
            payload: envelope
        )
        sendFrame(messageFrame)
        return [
            "success": true,
            "messageId": targetMessageId,
            "sessionId": sessionId,
        ]
    }

    @objc public func getSessionState(sessionId: String?) -> [String: Any] {
        if let sessionId, let currentSessionId = sessionState.sessionId, sessionId != currentSessionId {
            return [
                "sessionId": sessionId,
                "state": "closed",
                "closedAt": now(),
                "lastError": "SESSION_NOT_FOUND",
            ]
        }

        return sessionState.toDictionary()
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

        let host = Host.current().localizedName ?? "ios-host"
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
                    paired: false,
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
                paired: false,
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
        let collector = MdnsCollector()
        collector.start(
            serviceType: normalizeMdnsType(serviceType),
            timeoutMs: timeoutMs
        )
        return collector.collectedAddresses()
    }

    private func normalizeMdnsType(_ serviceType: String) -> String {
        let trimmed = serviceType.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return defaultMdnsServiceType
        }
        return trimmed.hasSuffix(".") ? trimmed : "\(trimmed)."
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

        var receiveTimeout = timeval(
            tv_sec: 0,
            tv_usec: Int32(max(200, timeoutMs) * 1000)
        )
        _ = setsockopt(
            socketFd,
            SOL_SOCKET,
            SO_RCVTIMEO,
            &receiveTimeout,
            socklen_t(MemoryLayout<timeval>.size)
        )

        var destination = sockaddr_in()
        destination.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        destination.sin_family = sa_family_t(AF_INET)
        destination.sin_port = CFSwapInt16HostToBig(udpDiscoveryPort)
        destination.sin_addr = in_addr(s_addr: inet_addr("255.255.255.255"))

        let payload = Array(udpDiscoveryMagic.utf8)
        payload.withUnsafeBytes { bytes in
            guard let rawPointer = bytes.baseAddress else {
                return
            }
            withUnsafePointer(to: &destination) { destinationPointer in
                destinationPointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
                    _ = sendto(
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
            if receivedBytes <= 0 {
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
            results.insert(String(cString: addressBuffer))
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

    private func sendFrame(_ frame: [String: Any], through connection: NWConnection? = nil) {
        let target = connection ?? self.connection
        guard let target else {
            return
        }
        guard let payload = try? JSONSerialization.data(withJSONObject: frame) else {
            return
        }
        var length = UInt32(payload.count).bigEndian
        let header = Data(bytes: &length, count: MemoryLayout<UInt32>.size)
        let packet = header + payload
        target.send(content: packet, completion: .contentProcessed({ _ in }))
    }

    private func receiveSingleFrame(
        through connection: NWConnection? = nil,
        completion: @escaping ([String: Any]?) -> Void
    ) {
        let target = connection ?? self.connection
        guard let target else {
            completion(nil)
            return
        }
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

    private func startReceiveLoop() {
        receiveSingleFrame { [weak self] frame in
            guard let self else {
                return
            }
            guard let frame else {
                self.sessionState.state = "closed"
                self.sessionState.closedAt = self.now()
                return
            }

            if frame["type"] as? String == "close" {
                self.sessionState.state = "closed"
                self.sessionState.closedAt = self.now()
                self.onSessionClosed?([
                    "sessionId": frame["sessionId"] as Any,
                    "reason": "peer-closed",
                ])
                return
            }
            if frame["type"] as? String == "message" {
                let payload = frame["payload"] as? [String: Any]
                self.onMessageReceived?([
                    "sessionId": frame["sessionId"] as Any,
                    "messageId": frame["messageId"] as Any,
                    "messageType": payload?["messageType"] as? String ?? "transport.message.received",
                    "payload": payload?["payload"] as Any,
                    "timestamp": frame["timestamp"] as? Int ?? self.now(),
                ])
            } else if frame["type"] as? String == "ack" {
                self.onMessageAck?([
                    "sessionId": frame["sessionId"] as Any,
                    "messageId": frame["messageId"] as Any,
                    "timestamp": frame["timestamp"] as? Int ?? self.now(),
                ])
            } else if frame["type"] as? String == "error" {
                self.onTransportError?([
                    "sessionId": frame["sessionId"] as Any,
                    "code": "TRANSPORT_IO_ERROR",
                    "message": frame["error"] as? String ?? "Unknown transport error",
                ])
            }
            self.startReceiveLoop()
        }
    }
}

private final class MdnsCollector: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
    private let browser = NetServiceBrowser()
    private var addresses = Set<String>()
    private let accessQueue = DispatchQueue(label: "com.synra.lan-discovery.mdns-collector")

    override init() {
        super.init()
        browser.delegate = self
    }

    func start(serviceType: String, timeoutMs: Int) {
        browser.searchForServices(ofType: serviceType, inDomain: "local.")
        let timeout = DispatchTime.now() + .milliseconds(max(timeoutMs, 200))
        accessQueue.asyncAfter(deadline: timeout) { [weak self] in
            self?.browser.stop()
        }
        Thread.sleep(forTimeInterval: Double(max(timeoutMs, 200)) / 1000.0)
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
        service.delegate = self
        service.resolve(withTimeout: 1.5)
    }

    func netServiceDidResolveAddress(_ sender: NetService) {
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
    let paired: Bool
    let connectable: Bool
    let connectCheckAt: Int?
    let connectCheckError: String?
    let discoveredAt: Int
    let lastSeenAt: Int

    func merge(with incoming: DeviceRecord) -> DeviceRecord {
        DeviceRecord(
            deviceId: deviceId,
            name: incoming.name,
            ipAddress: incoming.ipAddress,
            source: incoming.source,
            paired: paired || incoming.paired,
            connectable: incoming.connectable,
            connectCheckAt: incoming.connectCheckAt,
            connectCheckError: incoming.connectCheckError,
            discoveredAt: discoveredAt,
            lastSeenAt: Int(Date().timeIntervalSince1970 * 1000)
        )
    }

    func withPaired(_ value: Bool) -> DeviceRecord {
        DeviceRecord(
            deviceId: deviceId,
            name: name,
            ipAddress: ipAddress,
            source: source,
            paired: value,
            connectable: connectable,
            connectCheckAt: connectCheckAt,
            connectCheckError: connectCheckError,
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
            paired: paired,
            connectable: value,
            connectCheckAt: Int(Date().timeIntervalSince1970 * 1000),
            connectCheckError: error,
            discoveredAt: discoveredAt,
            lastSeenAt: Int(Date().timeIntervalSince1970 * 1000)
        )
    }

    func toDictionary() -> [String: Any] {
        [
            "deviceId": deviceId,
            "name": name,
            "ipAddress": ipAddress,
            "source": source,
            "paired": paired,
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

private struct SessionState {
    var sessionId: String?
    var deviceId: String?
    var host: String?
    var port: Int?
    var state: String = "idle"
    var lastError: String?
    var openedAt: Int?
    var closedAt: Int?

    func toDictionary() -> [String: Any] {
        [
            "sessionId": sessionId as Any,
            "deviceId": deviceId as Any,
            "host": host as Any,
            "port": port as Any,
            "state": state,
            "lastError": lastError as Any,
            "openedAt": openedAt as Any,
            "closedAt": closedAt as Any,
        ]
    }
}
