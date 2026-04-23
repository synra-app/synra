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
        CAPPluginMethod(name: "probeConnectable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "closeSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendMessage", returnType: CAPPluginReturnPromise),
    ]
    private let implementation = LanDiscoveryPlugin()

    public override func load() {
        super.load()
        implementation.onSessionOpened = { [weak self] payload in
            self?.notifyListeners("sessionOpened", data: payload)
        }
        implementation.onSessionClosed = { [weak self] payload in
            self?.notifyListeners("sessionClosed", data: payload)
        }
        implementation.onMessageReceived = { [weak self] payload in
            self?.notifyListeners("messageReceived", data: payload)
        }
        implementation.onTransportError = { [weak self] payload in
            self?.notifyListeners("transportError", data: payload)
        }
        implementation.onDiscoveredPeerDevice = { [weak self] payload in
            self?.notifyListeners("deviceFound", data: payload)
            self?.notifyListeners("deviceUpdated", data: payload)
            self?.notifyListeners("deviceConnectableUpdated", data: payload)
        }
    }

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

    @objc func probeConnectable(_ call: CAPPluginCall) {
        let port = call.getInt("port").map { NSNumber(value: $0) }
        let timeoutMs = call.getInt("timeoutMs").map { NSNumber(value: $0) }
        let result = implementation.probeConnectable(port: port, timeoutMs: timeoutMs)
        if let devices = result["devices"] as? [[String: Any]] {
            for device in devices {
                notifyListeners("deviceConnectableUpdated", data: ["device": device])
            }
        }
        call.resolve(result)
    }

    @objc func closeSession(_ call: CAPPluginCall) {
        guard let sessionId = call.getString("sessionId") else {
            call.reject("sessionId is required.")
            return
        }
        let result = implementation.closeSession(sessionId: sessionId)
        call.resolve(result)
    }

    @objc func sendMessage(_ call: CAPPluginCall) {
        guard
            let sessionId = call.getString("sessionId"),
            let messageType = call.getString("messageType")
        else {
            call.reject("sessionId/messageType are required.")
            return
        }
        let payload = call.options["payload"] ?? NSNull()
        let messageId = call.getString("messageId")

        guard
            let result = implementation.sendMessage(
                sessionId: sessionId,
                messageType: messageType,
                payload: payload,
                messageId: messageId
            )
        else {
            call.reject("Session is not open.")
            return
        }

        call.resolve(result)
    }
}
