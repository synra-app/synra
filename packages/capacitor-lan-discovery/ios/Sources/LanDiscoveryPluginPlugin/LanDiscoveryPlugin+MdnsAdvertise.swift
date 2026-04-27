import Foundation

extension LanDiscoveryPlugin {
    /// TXT keys aligned with Electron `bonjour.publish` / `MdnsCollector.extractSourceDeviceId`.
    /// SYNRA-COMM::UDP_DISCOVERY::CONNECT::DISCOVERY_SCAN — TXT for peer correlation only (no display strings).
    internal func buildSynraMdnsTxtRecordData() -> Data? {
        let entries: [String: Data] = [
            "appId": Data(appId.utf8),
            "sourceDeviceId": Data(localDeviceUuid().utf8),
            "protocolVersion": Data(protocolVersion.utf8),
        ]
        return NetService.data(fromTXTRecord: entries)
    }

    func startMdnsAdvertisement() {
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
        // SYNRA-COMM::UDP_DISCOVERY::CONNECT::DISCOVERY_SCAN — TXT for peer correlation only (no display strings).
        if let txtData = buildSynraMdnsTxtRecordData(), !service.setTXTRecord(txtData) {
            #if DEBUG
                print("[lan-discovery] mdns setTXTRecord failed for \(serviceName)")
            #endif
        }
        service.publish()
        advertisedService = service
    }

    func stopMdnsAdvertisement() {
        advertisedService?.stop()
        advertisedService = nil
    }
}
