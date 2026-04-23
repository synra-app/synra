import Foundation
import Capacitor

/**
 * Please read the Capacitor iOS Plugin Development Guide
 * here: https://capacitorjs.com/docs/plugins/ios
 */
@objc(LanDiscoveryPluginPlugin)
public class LanDiscoveryPluginPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LanDiscoveryPluginPlugin"
    public let jsName = "LanDiscovery"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startDiscovery", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopDiscovery", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDiscoveredDevices", returnType: CAPPluginReturnPromise),
    ]
    private let implementation = LanDiscoveryPlugin()

    @objc func startDiscovery(_ call: CAPPluginCall) {
        let includeLoopback = call.getBool("includeLoopback") ?? false
        let manualTargets = call.getArray("manualTargets", String.self) ?? []
        let enableProbeFallback = call.getBool("enableProbeFallback") ?? true
        let discoveryMode = call.getString("discoveryMode")
        let mdnsServiceType = call.getString("mdnsServiceType")
        let discoveryTimeoutMs = call.getInt("discoveryTimeoutMs").map { NSNumber(value: $0) }
        let subnetCidrs = call.getArray("subnetCidrs", String.self) ?? []
        let maxProbeHosts = call.getInt("maxProbeHosts").map { NSNumber(value: $0) }
        let reset = call.getBool("reset") ?? true
        let scanWindowMs = call.getInt("scanWindowMs").map { NSNumber(value: $0) }
        let probePort = call.getInt("port").map { NSNumber(value: $0) }
        let probeTimeoutMs = call.getInt("timeoutMs").map { NSNumber(value: $0) }

        let result = implementation.startDiscovery(
            includeLoopback: includeLoopback,
            manualTargets: manualTargets,
            enableProbeFallback: enableProbeFallback,
            discoveryMode: discoveryMode,
            mdnsServiceType: mdnsServiceType,
            discoveryTimeoutMs: discoveryTimeoutMs,
            subnetCidrs: subnetCidrs,
            maxProbeHosts: maxProbeHosts,
            reset: reset,
            scanWindowMs: scanWindowMs,
            probePort: probePort,
            probeTimeoutMs: probeTimeoutMs
        )
        notifyListeners("scanStateChanged", data: [
            "state": result["state"] as? String ?? "scanning",
        ])
        call.resolve(result)
    }

    @objc func stopDiscovery(_ call: CAPPluginCall) {
        let result = implementation.stopDiscovery()
        notifyListeners("scanStateChanged", data: ["state": "idle"])
        call.resolve(result)
    }

    @objc func getDiscoveredDevices(_ call: CAPPluginCall) {
        call.resolve(implementation.listDevices())
    }
}
