import Foundation
import Capacitor

@objc(DeviceConnectionPluginPlugin)
public class DeviceConnectionPluginPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DeviceConnectionPluginPlugin"
    public let jsName = "DeviceConnection"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "closeSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendMessage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSessionState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pullHostEvents", returnType: CAPPluginReturnPromise),
    ]

    private let implementation = DeviceConnectionPluginCore()

    public override func load() {
        implementation.onMessageReceived = { [weak self] payload in
            self?.notifyListeners("messageReceived", data: payload)
        }
        implementation.onMessageAck = { [weak self] payload in
            self?.notifyListeners("messageAck", data: payload)
        }
        implementation.onSessionClosed = { [weak self] payload in
            self?.notifyListeners("sessionClosed", data: payload)
        }
        implementation.onTransportError = { [weak self] payload in
            self?.notifyListeners("transportError", data: payload)
        }
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

        var opened: [String: Any] = [
            "sessionId": result["sessionId"] as Any,
            "transport": "tcp",
        ]
        if let state = result["state"] as? String {
            opened["state"] = state
        }
        opened["deviceId"] = deviceId
        opened["host"] = host
        opened["port"] = port
        notifyListeners("sessionOpened", data: opened)
        call.resolve(result)
    }

    @objc func closeSession(_ call: CAPPluginCall) {
        let sessionId = call.getString("sessionId")
        let result = implementation.closeSession(sessionId: sessionId)
        notifyListeners("sessionClosed", data: [
            "sessionId": result["sessionId"] as Any,
            "reason": "closed-by-client",
            "transport": "tcp",
        ])
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
            call.reject("sendMessage failed.")
            return
        }

        call.resolve(result)
    }

    @objc func getSessionState(_ call: CAPPluginCall) {
        let sessionId = call.getString("sessionId")
        call.resolve(implementation.getSessionState(sessionId: sessionId))
    }

    @objc func pullHostEvents(_ call: CAPPluginCall) {
        call.resolve(["events": []])
    }
}
