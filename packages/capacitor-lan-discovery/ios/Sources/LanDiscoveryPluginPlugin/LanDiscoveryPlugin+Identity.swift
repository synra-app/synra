import Foundation

extension LanDiscoveryPlugin {
    func now() -> Int {
        Int(Date().timeIntervalSince1970 * 1000)
    }

    /// Handshake `displayName` comes from `synra.device.basic-info` JSON (`deviceName`), defaulting to UUID hex prefix.
    func localSynraDisplayName() -> String {
        resolvedDeviceName()
    }

    func resolvedDeviceName() -> String {
        let defaults = UserDefaults.standard
        if let stored = defaults.string(forKey: deviceBasicInfoDefaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
            !stored.isEmpty,
            let parsed = parseBasicInfoDeviceName(from: stored)
        {
            return parsed
        }
        if let legacy = defaults.string(forKey: legacyDeviceDisplayNameDefaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
            !legacy.isEmpty
        {
            persistBasicInfoJson(deviceName: legacy, defaults: defaults)
            defaults.removeObject(forKey: legacyDeviceDisplayNameDefaultsKey)
            return legacy
        }
        let uuid = localDeviceUuid()
        let raw = uuid.replacingOccurrences(of: "-", with: "").lowercased()
        let derived = String(raw.prefix(6))
        let name = derived.isEmpty ? "device" : derived
        persistBasicInfoJson(deviceName: name, defaults: defaults)
        return name
    }

    func parseBasicInfoDeviceName(from jsonString: String) -> String? {
        guard let data = jsonString.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let dn = obj["deviceName"] as? String
        else {
            return nil
        }
        let trimmed = dn.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    func persistBasicInfoJson(deviceName: String, defaults: UserDefaults) {
        let payload: [String: Any] = ["deviceName": deviceName]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let str = String(data: data, encoding: .utf8)
        else {
            return
        }
        defaults.set(str, forKey: deviceBasicInfoDefaultsKey)
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
