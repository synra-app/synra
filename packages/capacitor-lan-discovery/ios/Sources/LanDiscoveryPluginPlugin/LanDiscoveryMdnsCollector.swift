import Foundation

final class MdnsCollector: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
    private let browser = NetServiceBrowser()
    private var addresses = Set<String>()
    private var sourceDeviceIdByIp: [String: String] = [:]
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
            sourceDeviceIdByIp.removeAll()
        }
        #if DEBUG
            print("[lan-discovery] mdns browse type=\(serviceType) timeoutMs=\(timeoutMs)")
        #endif
        let browseSeconds = Double(max(timeoutMs, 200)) / 1000.0
        let resolveGraceMs = 150
        let resolveTimeoutSec = max(1, Int(ceil(Double(resolveGraceMs) / 1000.0)))
        lastResolveTimeout = resolveTimeoutSec
        let totalRunSeconds = browseSeconds + Double(resolveGraceMs) / 1000.0 + 0.05
        browser.searchForServices(ofType: serviceType, inDomain: "local.")
        // Pump the current run loop so NetServiceBrowser / NetService delegate callbacks fire.
        let limitDate = Date().addingTimeInterval(totalRunSeconds)
        RunLoop.current.run(until: limitDate)
        browser.stop()
        pendingResolutions.removeAll()
    }

    /// IPv4 + optional `sourceDeviceId` from TXT (no display strings; SYNRA-COMM::UDP_DISCOVERY::CONNECT::DISCOVERY_SCAN).
    func collectedEntries() -> [(ip: String, sourceDeviceId: String?)] {
        accessQueue.sync {
            addresses.sorted().map { ip in
                (ip, sourceDeviceIdByIp[ip])
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
        let sourceDeviceId = Self.extractSourceDeviceId(sender)
        accessQueue.async { [weak self] in
            guard let self else {
                return
            }
            self.addresses.insert(chosen)
            if let sourceDeviceId, !sourceDeviceId.isEmpty {
                self.sourceDeviceIdByIp[chosen] = sourceDeviceId
            }
        }
    }

    private static func extractSourceDeviceId(_ service: NetService) -> String? {
        guard let txtData = service.txtRecordData(),
              !txtData.isEmpty
        else {
            return nil
        }
        let dictionary = NetService.dictionary(fromTXTRecord: txtData)
        guard let raw = dictionary["sourceDeviceId"],
              !raw.isEmpty,
              let parsed = String(data: raw, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines),
              !parsed.isEmpty
        else {
            return nil
        }
        return parsed
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
