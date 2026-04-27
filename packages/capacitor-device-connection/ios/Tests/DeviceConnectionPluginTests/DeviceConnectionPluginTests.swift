import XCTest
@testable import DeviceConnectionPlugin

final class DeviceConnectionPluginTests: XCTestCase {
    func testGetTransportStateWhenIdle() {
        let core = DeviceConnectionPluginCore()
        let state = core.getTransportState(target: nil)
        XCTAssertEqual(state["state"] as? String, "idle")
        XCTAssertEqual(state["transport"] as? String, "tcp")
    }

    func testMapWireEventNameMapsLegacyTypes() {
        let core = DeviceConnectionPluginCore()
        XCTAssertEqual(core.mapWireEventName(fromLegacyType: "connect"), core.deviceTcpConnectEvent)
        XCTAssertEqual(core.mapWireEventName(fromLegacyType: "connectAck"), core.deviceTcpConnectAckEvent)
        XCTAssertEqual(core.mapWireEventName(fromLegacyType: "ack"), core.deviceTcpAckEvent)
        XCTAssertEqual(core.mapWireEventName(fromLegacyType: "close"), core.deviceTcpCloseEvent)
        XCTAssertEqual(core.mapWireEventName(fromLegacyType: "error"), core.deviceTcpErrorEvent)
        XCTAssertEqual(core.mapWireEventName(fromLegacyType: "heartbeat"), core.deviceTcpHeartbeatEvent)
    }

    func testBuildTransportErrorEventFromWireProvidesDefaultCode() {
        let core = DeviceConnectionPluginCore()
        let event = core.buildTransportErrorEventFromWire(
            frame: [
                "payload": [
                    "message": "socket closed",
                ]
            ],
            fallbackDeviceId: "device-a"
        )
        XCTAssertEqual(event["deviceId"] as? String, "device-a")
        XCTAssertEqual(event["code"] as? String, core.errorCodeTransportIoError)
        XCTAssertEqual(event["message"] as? String, "socket closed")
        XCTAssertEqual(event["transport"] as? String, "tcp")
    }

    func testPairingAndControlEventGuards() {
        let core = DeviceConnectionPluginCore()
        XCTAssertTrue(core.isTransportControlEvent(core.deviceTcpAckEvent))
        XCTAssertTrue(core.isTransportControlEvent(core.deviceTcpErrorEvent))
        XCTAssertTrue(core.isDevicePairingEvent("device.pairing.request"))
        XCTAssertFalse(core.isDevicePairingEvent("custom.chat.text"))
    }

    /// Ensures probe connect frames carry `target` when provided (bridge must forward `target` from JS like Android).
    func testSynraLanFrameIncludesTargetForProbeConnect() {
        let core = DeviceConnectionPluginCore()
        let peerTarget = "40a39cb9-4fce-41da-8ae2-c8d8ce5aa438"
        let payload: [String: Any] = [
            "appId": core.appId,
            "from": "7eb638c0-6315-4b1f-9dfb-a72cda17ba11",
            "probe": true,
            "displayName": "test",
        ]
        let frame = core.synraLanFrame(
            type: core.legacyTypeConnect,
            requestId: "req-probe-1",
            event: nil,
            from: "7eb638c0-6315-4b1f-9dfb-a72cda17ba11",
            target: peerTarget,
            replyRequestId: nil,
            payload: payload,
            timestamp: 1,
            error: nil
        )
        XCTAssertEqual(frame["target"] as? String, peerTarget)
        XCTAssertEqual(frame["event"] as? String, core.deviceTcpConnectEvent)
    }
}
