import Foundation

extension LanDiscoveryPlugin {
    func now() -> Int {
        Int(Date().timeIntervalSince1970 * 1000)
    }

    func localDeviceUuid() -> String {
        let defaults = UserDefaults.standard
        if let existing = defaults.string(forKey: unifiedDeviceUuidDefaultsKey), !existing.isEmpty {
            return existing
        }
        if let legacy = defaults.string(forKey: legacyLanDeviceUuidKey), !legacy.isEmpty {
            defaults.set(legacy, forKey: unifiedDeviceUuidDefaultsKey)
            defaults.removeObject(forKey: legacyLanDeviceUuidKey)
            return legacy
        }
        let legacyDcKey = "synra.device-connection.device-uuid"
        if let legacyDc = defaults.string(forKey: legacyDcKey), !legacyDc.isEmpty {
            defaults.set(legacyDc, forKey: unifiedDeviceUuidDefaultsKey)
            defaults.removeObject(forKey: legacyDcKey)
            return legacyDc
        }
        let created = UUID().uuidString
        defaults.set(created, forKey: unifiedDeviceUuidDefaultsKey)
        return created
    }

    func canonicalLanDeviceId(fromWireSourceDeviceId raw: String) -> String {
        raw.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
