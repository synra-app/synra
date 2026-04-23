import Foundation

/// Row model for discovered LAN devices (single type definition for SwiftPM / Xcode split sources).
internal struct DeviceRecord {
    let deviceId: String
    let name: String
    let ipAddress: String
    /// Synra TCP port when known (defaults to app standard for LAN).
    let port: Int
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
        port: Int,
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
        self.port = port
        self.source = source
        self.connectable = connectable
        self.connectCheckAt = connectCheckAt
        self.connectCheckError = connectCheckError
        self.discoveredAt = discoveredAt
        self.lastSeenAt = lastSeenAt
    }
}

extension DeviceRecord {
    func merge(with incoming: DeviceRecord) -> DeviceRecord {
        DeviceRecord(
            deviceId: deviceId,
            name: incoming.name,
            ipAddress: incoming.ipAddress,
            port: incoming.port,
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
            port: port,
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
            port: port,
            source: source,
            connectable: connectable,
            connectCheckAt: connectCheckAt,
            connectCheckError: connectCheckError,
            discoveredAt: discoveredAt,
            lastSeenAt: lastSeenAt
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
        self.init(
            deviceId: deviceId,
            name: name,
            ipAddress: ipAddress,
            port: (dictionary["port"] as? Int) ?? 32100,
            source: source,
            connectable: connectable,
            connectCheckAt: dictionary["connectCheckAt"] as? Int,
            connectCheckError: dictionary["connectCheckError"] as? String,
            discoveredAt: discoveredAt,
            lastSeenAt: lastSeenAt
        )
    }

    func toDictionary() -> [String: Any] {
        [
            "deviceId": deviceId,
            "name": name,
            "ipAddress": ipAddress,
            "port": port,
            "source": source,
            "connectable": connectable,
            "connectCheckAt": connectCheckAt as Any,
            "connectCheckError": connectCheckError as Any,
            "discoveredAt": discoveredAt,
            "lastSeenAt": lastSeenAt
        ]
    }
}
