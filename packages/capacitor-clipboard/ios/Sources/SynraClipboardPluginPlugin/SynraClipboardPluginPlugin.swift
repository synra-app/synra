import Foundation
import Capacitor

/**
 * SynraClipboard — native iOS clipboard bridge for the Synra Capacitor host.
 *
 * Why this exists (mirrors Android): `navigator.clipboard.writeText` from a
 * Capacitor iOS WebView is blocked outside of an explicit user gesture; reads
 * also need an attached WKWebView permission grant. `UIPasteboard.general`
 * has neither restriction and works from any thread that touches the main
 * queue.
 *
 * Methods (mirrors `SynraClipboardPlugin` in src/definitions.ts):
 *   - read():  resolve({ text: string })
 *   - write({ text }): resolve()
 */
@objc(SynraClipboardPluginPlugin)
public class SynraClipboardPluginPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SynraClipboardPluginPlugin"
    public let jsName = "SynraClipboard"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
    ]

    @objc func read(_ call: CAPPluginCall) {
        let pasteboard = UIPasteboard.general
        // `string` returns nil when the clipboard is empty; normalize to ""
        // so JS-side parsing does not have to special-case null/undefined.
        let text = pasteboard.string ?? ""
        call.resolve(["text": text])
    }

    @objc func write(_ call: CAPPluginCall) {
        guard let text = call.getString("text") else {
            call.reject("text is required.")
            return
        }
        UIPasteboard.general.string = text
        call.resolve()
    }
}