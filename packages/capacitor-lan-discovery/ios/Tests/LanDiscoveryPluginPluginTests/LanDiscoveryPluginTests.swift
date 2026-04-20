import XCTest
@testable import LanDiscoveryPluginPlugin

final class LanDiscoveryPluginTests: XCTestCase {
    func testListDevicesInitialState() {
        let implementation = LanDiscoveryPlugin()
        let result = implementation.listDevices()
        XCTAssertEqual(result["state"] as? String, "idle")
    }
}
