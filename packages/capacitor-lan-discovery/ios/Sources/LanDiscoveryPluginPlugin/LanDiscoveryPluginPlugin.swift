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
        CAPPluginMethod(name: "pairDevice", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "probeConnectable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "closeSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendMessage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSessionState", returnType: CAPPluginReturnPromise),
    ]
    private let implementation = LanDiscoveryPlugin()

    @objc func startDiscovery(_ call: CAPPluginCall) {
        let includeLoopback = call.getBool("includeLoopback") ?? false
        let manualTargets = call.getArray("manualTargets", String.self) ?? []
        let enableProbeFallback = call.getBool("enableProbeFallback") ?? true
        let reset = call.getBool("reset") ?? true
        let scanWindowMs = call.getInt("scanWindowMs").map { NSNumber(value: $0) }
        let probePort = call.getInt("port").map { NSNumber(value: $0) }
        let probeTimeoutMs = call.getInt("timeoutMs").map { NSNumber(value: $0) }

        var result = implementation.startDiscovery(
            includeLoopback: includeLoopback,
            manualTargets: manualTargets,
            enableProbeFallback: enableProbeFallback,
            reset: reset,
            scanWindowMs: scanWindowMs
        )
        let probeResult = implementation.probeConnectable(port: probePort, timeoutMs: probeTimeoutMs)
        result["devices"] = probeResult["devices"]
        notifyListeners("scanStateChanged", data: [
            "state": result["state"] as? String ?? "scanning",
            "startedAt": result["startedAt"] as Any,
        ])
        if let devices = result["devices"] as? [[String: Any]] {
            for device in devices {
                notifyListeners("deviceFound", data: ["device": device])
            }
        }
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

    @objc func pairDevice(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId"), !deviceId.isEmpty else {
            call.reject("deviceId is required.")
            return
        }

        guard let result = implementation.pairDevice(deviceId: deviceId) else {
            call.reject("Target device was not found.")
            return
        }

        if let device = result["device"] as? [String: Any] {
            notifyListeners("deviceUpdated", data: ["device": device])
        }
        call.resolve(result)
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

    @objc func openSession(_ call: CAPPluginCall) {
        guard
            let deviceId = call.getString("deviceId"),
            let host = call.getString("host"),
            let port = call.getInt("port")
        else {
            call.reject("deviceId/host/port are required.")
            return
        }

        let token = call.getString("token")
        guard
            let result = implementation.openSession(
                deviceId: deviceId,
                host: host,
                port: NSNumber(value: port),
                token: token
            )
        else {
            call.reject("openSession failed.")
            return
        }

        notifyListeners("sessionOpened", data: [
            "sessionId": result["sessionId"] as Any,
            "deviceId": deviceId,
            "host": host,
            "port": port,
        ])
        call.resolve(result)
    }

    @objc func closeSession(_ call: CAPPluginCall) {
        let sessionId = call.getString("sessionId")
        let result = implementation.closeSession(sessionId: sessionId)
        notifyListeners("sessionClosed", data: [
            "sessionId": result["sessionId"] as Any,
            "reason": "closed-by-client",
        ])
        call.resolve(result)
    }

    @objc func sendMessage(_ call: CAPPluginCall) {
        guard
            let sessionId = call.getString("sessionId"),
            let type = call.getString("type")
        else {
            call.reject("sessionId/type are required.")
            return
        }

        let payload = call.options["payload"] ?? NSNull()
        let messageId = call.getString("messageId")
        guard
            let result = implementation.sendMessage(
                sessionId: sessionId,
                type: type,
                payload: payload,
                messageId: messageId
            )
        else {
            call.reject("sendMessage failed.")
            return
        }

        notifyListeners("messageAck", data: [
            "sessionId": sessionId,
            "messageId": result["messageId"] as Any,
            "timestamp": Int(Date().timeIntervalSince1970 * 1000),
        ])
        call.resolve(result)
    }

    @objc func getSessionState(_ call: CAPPluginCall) {
        let sessionId = call.getString("sessionId")
        call.resolve(implementation.getSessionState(sessionId: sessionId))
    }
}
