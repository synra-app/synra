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
        CAPPluginMethod(name: "sendLanEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSessionState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pullHostEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "probeSynraPeers", returnType: CAPPluginReturnPromise),
    ]

    private let implementation = DeviceConnectionPluginCore()
    private let sessionQueue = DispatchQueue(label: "com.synra.device-connection.plugin")

    public override func load() {
        implementation.startSynraTcpServerIfNeeded()
        implementation.onSessionOpened = { [weak self] payload in
            self?.notifyListeners("sessionOpened", data: payload)
        }
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
        implementation.onLanWireEventReceived = { [weak self] payload in
            self?.notifyListeners("lanWireEventReceived", data: payload)
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
        guard let connectType = call.getString("connectType"), !connectType.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            call.reject("connectType is required.")
            return
        }

        let token = call.getString("token")
        let openResult: [String: Any]? = sessionQueue.sync {
            implementation.openSession(
                deviceId: deviceId,
                host: host,
                port: NSNumber(value: port),
                token: token,
                connectType: connectType
            )
        }
        guard let result = openResult else {
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
        if let display = result["displayName"] as? String, !display.isEmpty {
            opened["displayName"] = display
        }
        if let ack = result["connectAckPayload"] as? [String: Any] {
            opened["connectAckPayload"] = ack
        }
        notifyListeners("sessionOpened", data: opened)
        call.resolve(result)
    }

    @objc func closeSession(_ call: CAPPluginCall) {
        let sessionId = call.getString("sessionId")
        let result = sessionQueue.sync {
            implementation.closeSession(sessionId: sessionId)
        }
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
        let sendResult: [String: Any]? = sessionQueue.sync {
            implementation.sendMessage(
                sessionId: sessionId,
                messageType: messageType,
                payload: payload,
                messageId: messageId
            )
        }
        guard let result = sendResult else {
            call.reject("sendMessage failed.")
            return
        }

        call.resolve(result)
    }

    @objc func sendLanEvent(_ call: CAPPluginCall) {
        guard
            let sessionId = call.getString("sessionId"),
            let eventName = call.getString("eventName")
        else {
            call.reject("sessionId/eventName are required.")
            return
        }

        let payload = call.options["payload"] ?? NSNull()
        let eventId = call.getString("eventId")
        let schemaVersion = call.getInt("schemaVersion")
        let sendResult: [String: Any]? = sessionQueue.sync {
            implementation.sendLanEvent(
                sessionId: sessionId,
                eventName: eventName,
                payload: payload,
                eventId: eventId,
                schemaVersion: schemaVersion
            )
        }
        guard let result = sendResult else {
            call.reject("sendLanEvent failed.")
            return
        }

        call.resolve(result)
    }

    @objc func getSessionState(_ call: CAPPluginCall) {
        let sessionId = call.getString("sessionId")
        let snapshot = sessionQueue.sync {
            implementation.getSessionState(sessionId: sessionId)
        }
        call.resolve(snapshot)
    }

    @objc func pullHostEvents(_ call: CAPPluginCall) {
        call.resolve(["events": []])
    }

    @objc func probeSynraPeers(_ call: CAPPluginCall) {
        guard let rawTargets = call.options["targets"] as? [Any], !rawTargets.isEmpty else {
            call.reject("targets is required.")
            return
        }
        let timeoutMs = max(200, call.getInt("timeoutMs") ?? 1500)
        var targets: [[String: Any]] = []
        for entry in rawTargets {
            guard let obj = entry as? JSObject else {
                continue
            }
            guard let host = obj["host"] as? String else {
                continue
            }
            var row: [String: Any] = ["host": host]
            if let port = obj["port"] as? Int {
                row["port"] = port
            } else if let n = obj["port"] as? NSNumber {
                row["port"] = n.intValue
            }
            if let wire = obj["connectWirePayload"] as? [String: Any] {
                row["connectWirePayload"] = wire
            }
            targets.append(row)
        }
        guard !targets.isEmpty else {
            call.reject("targets must include host for each entry.")
            return
        }
        let rows = sessionQueue.sync {
            implementation.probeSynraPeersJson(targets: targets, timeoutMs: timeoutMs)
        }
        call.resolve(["results": rows])
    }
}
