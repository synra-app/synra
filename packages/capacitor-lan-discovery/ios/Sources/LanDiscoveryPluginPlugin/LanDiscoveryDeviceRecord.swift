import Foundation

struct DeviceRecord {
    let deviceId: String
    let name: String
    let ipAddress: String
    let source: String
    let connectable: Bool
    let connectCheckAt: Int?
    let connectCheckError: String?
    let discoveredAt: Int
    let lastSeenAt: Int

    init(
        deviceId: String,
        name: String,
        ipAddress: String,
        source: String,
        connectable: Bool,
        connectCheckAt: Int?,
        connectCheckError: String?,
        discoveredAt: Int,
        lastSeenAt: Int
    ) {
        self.deviceId = deviceId
        self.name = name
        self.ipAddress = ipAddress
        self.source = source
        self.connectable = connectable
        self.connectCheckAt = connectCheckAt
        self.connectCheckError = connectCheckError
        self.discoveredAt = discoveredAt
        self.lastSeenAt = lastSeenAt
    }

    func merge(with incoming: DeviceRecord) -> DeviceRecord {
        DeviceRecord(
            deviceId: deviceId,
            name: incoming.name,
            ipAddress: incoming.ipAddress,
            source: incoming.source,
            connectable: incoming.connectable,
            connectCheckAt: incoming.connectCheckAt,
            connectCheckError: incoming.connectCheckError,
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
            connectable: value,
            connectCheckAt: Int(Date().timeIntervalSince1970 * 1000),
            connectCheckError: error,
            discoveredAt: discoveredAt,
            lastSeenAt: Int(Date().timeIntervalSince1970 * 1000)
        )
    }

    func withName(_ newName: String) -> DeviceRecord {
        DeviceRecord(
            deviceId: deviceId,
            name: newName,
            ipAddress: ipAddress,
            source: source,
            connectable: connectable,
            connectCheckAt: connectCheckAt,
            connectCheckError: connectCheckError,
            discoveredAt: discoveredAt,
            lastSeenAt: Int(Date().timeIntervalSince1970 * 1000)
        )
    }

    init?(dictionary: [String: Any]) {
        guard
            let deviceId = dictionary["deviceId"] as? String,
            let name = dictionary["name"] as? String,
            let ipAddress = dictionary["ipAddress"] as? String,
            let source = dictionary["source"] as? String,
            let connectable = dictionary["connectable"] as? Bool,
            let discoveredAt = dictionary["discoveredAt"] as? Int,
            let lastSeenAt = dictionary["lastSeenAt"] as? Int
        else {
            return nil
        }
        self.deviceId = deviceId
        self.name = name
        self.ipAddress = ipAddress
        self.source = source
        self.connectable = connectable
        self.connectCheckAt = dictionary["connectCheckAt"] as? Int
        self.connectCheckError = dictionary["connectCheckError"] as? String
        self.discoveredAt = discoveredAt
        self.lastSeenAt = lastSeenAt
    }

    func toDictionary() -> [String: Any] {
        [
            "deviceId": deviceId,
            "name": name,
            "ipAddress": ipAddress,
            "source": source,
            "connectable": connectable,
            "connectCheckAt": connectCheckAt as Any,
            "connectCheckError": connectCheckError as Any,
            "discoveredAt": discoveredAt,
            "lastSeenAt": lastSeenAt,
        ]
    }
}
