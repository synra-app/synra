import Foundation
import Capacitor

private let storagePrefix = "synra.preferences."

@objc(SynraPreferencesPluginPlugin)
public class SynraPreferencesPluginPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SynraPreferencesPluginPlugin"
    public let jsName = "SynraPreferences"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    ]

    private func namespacedKey(_ key: String) -> String {
        storagePrefix + key
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("key is required.")
            return
        }
        let value = UserDefaults.standard.string(forKey: namespacedKey(key))
        call.resolve(["value": value as Any])
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("key is required.")
            return
        }
        guard let value = call.getString("value") else {
            call.reject("value is required.")
            return
        }
        UserDefaults.standard.set(value, forKey: namespacedKey(key))
        call.resolve()
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("key is required.")
            return
        }
        UserDefaults.standard.removeObject(forKey: namespacedKey(key))
        call.resolve()
    }
}
