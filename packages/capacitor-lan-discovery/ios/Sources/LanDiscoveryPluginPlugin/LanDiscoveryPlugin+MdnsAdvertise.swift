import Foundation

extension LanDiscoveryPlugin {
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
        service.publish()
        advertisedService = service
    }

    func stopMdnsAdvertisement() {
        advertisedService?.stop()
        advertisedService = nil
    }
}
