package com.synra.plugins.preferences;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SynraPreferences")
public class SynraPreferencesPlugin extends Plugin {
    private static final String PREFS_NAME = "synra_preferences_store";
    private static final String KEY_PREFIX = "synra.preferences.";

    private SharedPreferences prefs() {
        Context context = getContext();
        if (context == null) {
            return null;
        }
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private String namespacedKey(String key) {
        return KEY_PREFIX + key;
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isBlank()) {
            call.reject("key is required.");
            return;
        }
        SharedPreferences p = prefs();
        if (p == null) {
            call.reject("Context unavailable.");
            return;
        }
        String value = p.getString(namespacedKey(key), null);
        JSObject out = new JSObject();
        out.put("value", value);
        call.resolve(out);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || key.isBlank()) {
            call.reject("key is required.");
            return;
        }
        if (value == null) {
            call.reject("value is required.");
            return;
        }
        SharedPreferences p = prefs();
        if (p == null) {
            call.reject("Context unavailable.");
            return;
        }
        p.edit().putString(namespacedKey(key), value).apply();
        call.resolve();
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isBlank()) {
            call.reject("key is required.");
            return;
        }
        SharedPreferences p = prefs();
        if (p == null) {
            call.reject("Context unavailable.");
            return;
        }
        p.edit().remove(namespacedKey(key)).apply();
        call.resolve();
    }
}
