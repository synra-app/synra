package com.synra.plugins.clipboard;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * SynraClipboard — native clipboard bridge for the Synra Capacitor host.
 *
 * Why this exists: `navigator.clipboard.writeText` is gated by user-activation
 * inside the Capacitor Android WebView. Plugin code that runs in response to
 * a paired-device envelope (no click handler in scope) hits `NotAllowedError`
 * even though the user explicitly authorized the copy action moments earlier
 * via a UI button. The Android `ClipboardManager` API does not have that
 * restriction, so we hand the read/write through it and bypass the WebView
 * clipboard policy entirely.
 *
 * Methods (mirrors `SynraClipboardPlugin` in src/definitions.ts):
 *   - read():  resolve({ text: string })
 *   - write({ text }): resolve()
 */
@CapacitorPlugin(name = "SynraClipboard")
public class SynraClipboardPlugin extends Plugin {
    private ClipboardManager clipboardManager() {
        Context context = getContext();
        if (context == null) {
            return null;
        }
        return (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
    }

    @PluginMethod
    public void read(PluginCall call) {
        ClipboardManager cm = clipboardManager();
        if (cm == null) {
            call.reject("Clipboard service unavailable.");
            return;
        }
        ClipData clip = cm.getPrimaryClip();
        String text = "";
        if (clip != null && clip.getItemCount() > 0) {
            CharSequence seq = clip.getItemAt(0).coerceToText(getContext());
            text = seq == null ? "" : seq.toString();
        }
        JSObject out = new JSObject();
        out.put("text", text);
        call.resolve(out);
    }

    @PluginMethod
    public void write(PluginCall call) {
        String text = call.getString("text");
        if (text == null) {
            call.reject("text is required.");
            return;
        }
        ClipboardManager cm = clipboardManager();
        if (cm == null) {
            call.reject("Clipboard service unavailable.");
            return;
        }
        // `setPrimaryClip(ClipData)` overwrites the clipboard atomically; the
        // second arg is the label visible to other apps on Android 12+ when
        // they show the system "copied from X" affordance. Keep it short and
        // stable so it does not pollute the user-facing clipboard history.
        cm.setPrimaryClip(ClipData.newPlainText("SynraClipboard", text));
        call.resolve();
    }
}