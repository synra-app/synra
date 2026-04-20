import XCTest
@testable import DeviceConnectionPlugin

final class DeviceConnectionPluginTests: XCTestCase {
    func testGetSessionStateWhenIdle() {
        let core = DeviceConnectionPluginCore()
        let state = core.getSessionState(sessionId: nil)
        XCTAssertEqual(state["state"] as? String, "idle")
        XCTAssertEqual(state["transport"] as? String, "tcp")
    }
}
