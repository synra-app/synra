import Foundation
import XCTest
@testable import LanDiscoveryPluginPlugin

final class LanDiscoveryPluginTests: XCTestCase {
    func testListDevicesInitialState() {
        let implementation = LanDiscoveryPlugin()
        let result = implementation.listDevices()
        XCTAssertEqual(result["state"] as? String, "idle")
    }

    func testUdpDiscoveryResponsePayloadMatchesAndroidShape() {
        let plugin = LanDiscoveryPlugin()
        let payload = plugin.buildSynraUdpDiscoveryResponsePayload()
        XCTAssertEqual(payload["appId"] as? String, "synra")
        XCTAssertEqual(payload["protocolVersion"] as? String, "1.0")
        XCTAssertEqual(payload["port"] as? Int, 32100)
        let sid = payload["sourceDeviceId"] as? String
        XCTAssertNotNil(sid)
        XCTAssertFalse(sid?.isEmpty ?? true)
        XCTAssertNil(payload["displayName"] as? String)
    }

    func testMdnsTxtRecordContainsSourceDeviceIdKey() {
        let plugin = LanDiscoveryPlugin()
        guard let txtData = plugin.buildSynraMdnsTxtRecordData() else {
            XCTFail("expected TXT record data")
            return
        }
        let dict = NetService.dictionary(fromTXTRecord: txtData)
        guard let rawId = dict["sourceDeviceId"], !rawId.isEmpty else {
            XCTFail("missing sourceDeviceId in TXT")
            return
        }
        let parsedId = String(data: rawId, encoding: .utf8)
        XCTAssertNotNil(parsedId)
        XCTAssertFalse(parsedId?.isEmpty ?? true)
        XCTAssertNotNil(dict["appId"])
        XCTAssertNotNil(dict["protocolVersion"])
        XCTAssertNil(dict["displayName"])
    }
}
