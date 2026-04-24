import XCTest
@testable import DeviceConnectionPlugin

final class DeviceConnectionPluginTests: XCTestCase {
    func testGetTransportStateWhenIdle() {
        let core = DeviceConnectionPluginCore()
        let state = core.getTransportState(targetDeviceId: nil)
        XCTAssertEqual(state["state"] as? String, "idle")
        XCTAssertEqual(state["transport"] as? String, "tcp")
    }
}
