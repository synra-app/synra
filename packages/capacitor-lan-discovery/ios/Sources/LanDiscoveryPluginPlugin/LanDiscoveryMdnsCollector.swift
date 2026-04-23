import Foundation

final class MdnsCollector: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
    private let browser = NetServiceBrowser()
    private var addresses = Set<String>()
    private var bonjourHostByIp: [String: String] = [:]
    private let accessQueue = DispatchQueue(label: "com.synra.lan-discovery.mdns-collector")
    // NetService must be retained until resolve finishes; otherwise resolution never completes.
    private var pendingResolutions: [NetService] = []
    private var lastResolveTimeout: Int = 5

    override init() {
        super.init()
        browser.delegate = self
    }

    func start(serviceType: String, timeoutMs: Int) {
        accessQueue.sync {
            addresses.removeAll()
            bonjourHostByIp.removeAll()
        }
        #if DEBUG
            print("[lan-discovery] mdns browse type=\(serviceType) timeoutMs=\(timeoutMs)")
        #endif
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

    func collectedEntries() -> [(ip: String, bonjourName: String?)] {
        accessQueue.sync {
            addresses.sorted().map { ip in
                (ip, bonjourHostByIp[ip])
            }
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
        var ipv4Candidates: [String] = []
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
            ipv4Candidates.append(address)
        }
        let chosen = Self.pickPreferredIpv4(ipv4Candidates)
        guard let chosen else {
            return
        }
        let rawHost = sender.hostName?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let bonjourLabel = Self.normalizeBonjourHostName(rawHost)
        accessQueue.async { [weak self] in
            guard let self else {
                return
            }
            self.addresses.insert(chosen)
            guard let bonjourLabel, !bonjourLabel.isEmpty else {
                return
            }
            if let existing = self.bonjourHostByIp[chosen], !existing.isEmpty {
                self.bonjourHostByIp[chosen] = Self.preferBonjourLabel(existing, bonjourLabel)
            } else {
                self.bonjourHostByIp[chosen] = bonjourLabel
            }
        }
    }

    // Human-facing label from Bonjour host: strip trailing dots and `.local`.
    private static func normalizeBonjourHostName(_ raw: String) -> String? {
        var trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while trimmed.hasSuffix(".") {
            trimmed = String(trimmed.dropLast()).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if trimmed.isEmpty {
            return nil
        }
        let lower = trimmed.lowercased()
        if lower.hasSuffix(".local"), trimmed.count >= 6 {
            trimmed = String(trimmed.dropLast(6)).trimmingCharacters(in: .whitespacesAndNewlines)
            while trimmed.hasSuffix(".") {
                trimmed = String(trimmed.dropLast()).trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func preferBonjourLabel(_ a: String, _ b: String) -> String {
        if a.count != b.count {
            return a.count >= b.count ? a : b
        }
        return a <= b ? a : b
    }

    private static func pickPreferredIpv4(_ candidates: [String]) -> String? {
        guard !candidates.isEmpty else {
            return nil
        }
        let nonLinkLocal = candidates.filter { !$0.hasPrefix("169.254.") }
        if let first = nonLinkLocal.sorted().first {
            return first
        }
        return candidates.sorted().first
    }
}
