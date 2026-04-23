package com.synra.plugins.deviceconnection;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.content.Context;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "DeviceConnection")
public class DeviceConnectionPlugin extends Plugin {
    private static final int SESSION_ACK_TIMEOUT_MS = 3000;
    private static final int HEARTBEAT_INTERVAL_MS = 10_000;
    private static final String APP_ID = "synra";
    private static final String PROTOCOL_VERSION = "1.0";
  private static final String INSTANCE_PREFS_NAME = "synra_preferences_store";
  private static final String INSTANCE_UUID_KEY = "synra.preferences.synra.device.instance-uuid";
  private static final String DEVICE_BASIC_INFO_KEY = "synra.preferences.synra.device.basic-info";
    private static final String LEGACY_DEVICE_DISPLAY_NAME_KEY = "synra.preferences.synra.device.display-name";
    private static final String LEGACY_PREFS_NAME = "synra_device_connection";
    private static final String LEGACY_PREFS_DEVICE_UUID_KEY = "device_uuid";

    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService readerExecutor = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService heartbeatExecutor = Executors.newSingleThreadScheduledExecutor();
    private final AtomicBoolean sessionOpen = new AtomicBoolean(false);
    private ScheduledFuture<?> heartbeatTask;
    private Socket sessionSocket;
    private DataInputStream sessionInput;
    private DataOutputStream sessionOutput;
    private String currentSessionId;
    private String currentDeviceId;
    private String currentHost;
    private Integer currentPort;
    private String lastSessionError;

    @PluginMethod
    public void openSession(PluginCall call) {
        String deviceId = call.getString("deviceId");
        String host = call.getString("host");
        Integer port = call.getInt("port");
        if (deviceId == null || host == null || port == null) {
            call.reject("deviceId/host/port are required.");
            return;
        }
        String connectType = call.getString("connectType", null);
        if (connectType == null || connectType.isBlank()) {
            call.reject("connectType is required.");
            return;
        }

        ioExecutor.submit(() -> {
            closeSessionSocket();
            try {
                Socket socket = new Socket();
                socket.connect(new InetSocketAddress(host, port), SESSION_ACK_TIMEOUT_MS);
                socket.setSoTimeout(SESSION_ACK_TIMEOUT_MS);
                DataInputStream input = new DataInputStream(new BufferedInputStream(socket.getInputStream()));
                DataOutputStream output =
                    new DataOutputStream(new BufferedOutputStream(socket.getOutputStream()));

                String sessionId = UUID.randomUUID().toString();
                JSObject connectPayload = new JSObject();
                connectPayload.put("sourceDeviceId", getOrCreateLocalDeviceUuid());
                connectPayload.put("probe", false);
                connectPayload.put("displayName", localSynraDisplayName());
                connectPayload.put("connectType", connectType.trim());
                writeFrame(output, frame("connect", sessionId, null, connectPayload));
                JSONObject connectAck = readFrame(input);
                if (!"connectAck".equals(connectAck.optString("type"))) {
                    call.reject("Connect failed: missing connectAck.");
                    closeQuietly(socket);
                    return;
                }
                if (!APP_ID.equals(connectAck.optString("appId"))) {
                    call.reject("Connect failed: appId mismatch.");
                    closeQuietly(socket);
                    return;
                }
                JSONObject ackPayload = connectAck.optJSONObject("payload");
                String remoteDeviceId =
                    ackPayload == null ? null : ackPayload.optString("sourceDeviceId", null);
                if (remoteDeviceId == null || remoteDeviceId.isBlank()) {
                    call.reject("Connect failed: missing sourceDeviceId.");
                    closeQuietly(socket);
                    return;
                }
                socket.setSoTimeout(0);

                this.sessionSocket = socket;
                this.sessionInput = input;
                this.sessionOutput = output;
                this.currentSessionId = connectAck.optString("sessionId", sessionId);
                this.currentDeviceId = remoteDeviceId;
                this.currentHost = host;
                this.currentPort = port;
                this.lastSessionError = null;
                this.sessionOpen.set(true);

                startHeartbeatLoop();
                startSessionReader();

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("sessionId", this.currentSessionId);
                result.put("deviceId", this.currentDeviceId);
                result.put("direction", "outbound");
                result.put("host", this.currentHost);
                result.put("port", this.currentPort);
                result.put("state", "open");
                result.put("transport", "tcp");
                String remoteDisplay =
                    ackPayload == null ? null : ackPayload.optString("displayName", null);
                if (remoteDisplay != null && !remoteDisplay.isBlank()) {
                    result.put("displayName", remoteDisplay.trim());
                }
                if (ackPayload != null) {
                    try {
                        result.put("connectAckPayload", JSObject.fromJSONObject(ackPayload));
                    } catch (Exception ignored) {
                        // Omit connectAckPayload when JSObject.fromJSONObject fails.
                    }
                }
                notifyListeners("sessionOpened", result);
                call.resolve(result);
            } catch (Exception error) {
                this.lastSessionError = error.getMessage();
                this.sessionOpen.set(false);
                call.reject("openSession failed: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void probeSynraPeers(PluginCall call) {
        JSONArray targets = call.getData().optJSONArray("targets");
        int timeoutMs = call.getInt("timeoutMs", 1500);
        if (targets == null || targets.length() == 0) {
            call.reject("targets is required.");
            return;
        }
        ioExecutor.submit(() -> {
            try {
                JSONArray out = new JSONArray();
                for (int i = 0; i < targets.length(); i++) {
                    JSONObject row = targets.optJSONObject(i);
                    if (row == null) {
                        continue;
                    }
                    String host = row.optString("host", null);
                    if (host == null || host.isBlank()) {
                        continue;
                    }
                    int port = row.optInt("port", 32100);
                    JSONObject wireExtras = row.optJSONObject("connectWirePayload");
                    out.put(probeSynraOneHost(host.trim(), port, Math.max(200, timeoutMs), wireExtras));
                }
                JSObject ret = new JSObject();
                ret.put("results", out);
                call.resolve(ret);
            } catch (Exception error) {
                call.reject("probeSynraPeers failed: " + error.getMessage());
            }
        });
    }

    private JSONObject probeSynraOneHost(String host, int port, int timeoutMs, JSONObject wireExtras)
            throws IOException, JSONException {
        JSONObject base = new JSONObject();
        base.put("host", host);
        base.put("port", port);
        base.put("ok", false);
        Socket socket = new Socket();
        try {
            socket.connect(new InetSocketAddress(host, port), timeoutMs);
            socket.setSoTimeout(timeoutMs * 2);
            DataInputStream input = new DataInputStream(new BufferedInputStream(socket.getInputStream()));
            DataOutputStream output = new DataOutputStream(new BufferedOutputStream(socket.getOutputStream()));
            String sessionId = UUID.randomUUID().toString();
            JSObject probePayload = new JSObject();
            probePayload.put("sourceDeviceId", getOrCreateLocalDeviceUuid());
            probePayload.put("probe", true);
            probePayload.put("displayName", localSynraDisplayName());
            if (wireExtras != null) {
                java.util.Iterator<String> keys = wireExtras.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    probePayload.put(k, wireExtras.get(k));
                }
            }
            writeFrame(output, frame("connect", sessionId, null, probePayload));
            output.flush();
            JSONObject response = readFrame(input);
            if (!"connectAck".equals(response.optString("type"))) {
                base.put("error", "CONNECT_ACK_INVALID");
                return base;
            }
            if (!APP_ID.equals(response.optString("appId"))) {
                base.put("error", "APP_ID_MISMATCH");
                return base;
            }
            JSONObject ackPayload = response.optJSONObject("payload");
            if (ackPayload == null) {
                base.put("error", "MISSING_ACK_PAYLOAD");
                return base;
            }
            String remote = ackPayload.optString("sourceDeviceId", null);
            if (remote == null || remote.isBlank()) {
                base.put("error", "MISSING_REMOTE_DEVICE_ID");
                return base;
            }
            String localUuid = getOrCreateLocalDeviceUuid();
            String canonRemote = canonicalSynraDeviceId(remote.trim());
            String canonLocal = canonicalSynraDeviceId(localUuid);
            if (canonRemote.equals(canonLocal)) {
                base.put("error", "SELF_DEVICE");
                return base;
            }
            base.put("ok", true);
            base.put("wireSourceDeviceId", canonRemote);
            String dn = ackPayload.optString("displayName", "");
            if (!dn.isBlank()) {
                base.put("displayName", dn.trim());
            }
            base.put("connectAckPayload", ackPayload);
            return base;
        } catch (Exception error) {
            base.put("error", error.getMessage() == null ? "PROBE_FAILED" : error.getMessage());
            return base;
        } finally {
            closeQuietly(socket);
        }
    }

    private static String canonicalSynraDeviceId(String raw) {
        if (raw == null) {
            return "";
        }
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) {
            return trimmed;
        }
        if (trimmed.startsWith("device-") && trimmed.length() >= "device-".length() + 8) {
            return trimmed;
        }
        return hashSynraId(trimmed);
    }

    private static String hashSynraId(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder();
            for (byte current : bytes) {
                if (builder.length() >= 12) {
                    break;
                }
                builder.append(String.format(Locale.ROOT, "%02x", current));
            }
            return "device-" + builder;
        } catch (Exception ignored) {
            return "device-" + Math.abs(value.hashCode());
        }
    }

    @PluginMethod
    public void closeSession(PluginCall call) {
        String targetSession = call.getString("sessionId", this.currentSessionId);
        ioExecutor.submit(() -> {
            closeSessionSocket();
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("transport", "tcp");
            if (targetSession != null) {
                result.put("sessionId", targetSession);
            }
            notifyListeners("sessionClosed", result);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void sendMessage(PluginCall call) {
        String sessionId = call.getString("sessionId");
        String messageType = call.getString("messageType");
        Object payload = call.getData().opt("payload");
        String messageId = call.getString("messageId", UUID.randomUUID().toString());

        if (sessionId == null || messageType == null) {
            call.reject("sessionId/messageType are required.");
            return;
        }

        ioExecutor.submit(() -> {
            if (!sessionOpen.get() || sessionOutput == null || sessionInput == null) {
                call.reject("Session is not open.");
                return;
            }

            try {
                JSObject envelope = new JSObject();
                envelope.put("messageType", messageType);
                envelope.put("payload", payload);
                writeFrame(sessionOutput, frame("message", sessionId, messageId, envelope));

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("messageId", messageId);
                result.put("sessionId", sessionId);
                result.put("transport", "tcp");
                call.resolve(result);
            } catch (Exception error) {
                this.lastSessionError = error.getMessage();
                if (sessionOpen.get()) {
                    JSObject event = new JSObject();
                    event.put("sessionId", sessionId);
                    event.put("message", error.getMessage());
                    event.put("transport", "tcp");
                    notifyListeners("transportError", event);
                }
                call.reject("sendMessage failed: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void sendLanEvent(PluginCall call) {
        String sessionId = call.getString("sessionId");
        String eventName = call.getString("eventName");
        Object payload = call.getData().opt("payload");
        String eventId = call.getString("eventId");
        Integer schemaVersion = call.getInt("schemaVersion");

        if (sessionId == null || eventName == null) {
            call.reject("sessionId/eventName are required.");
            return;
        }

        ioExecutor.submit(() -> {
            if (!sessionOpen.get() || sessionOutput == null || sessionInput == null) {
                call.reject("Session is not open.");
                return;
            }

            try {
                JSObject envelope = new JSObject();
                envelope.put("eventName", eventName);
                if (payload != null) {
                    envelope.put("payload", payload);
                }
                if (eventId != null) {
                    envelope.put("eventId", eventId);
                }
                if (schemaVersion != null) {
                    envelope.put("schemaVersion", schemaVersion);
                }
                writeFrame(sessionOutput, frame("event", sessionId, null, envelope));

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("sessionId", sessionId);
                result.put("transport", "tcp");
                call.resolve(result);
            } catch (Exception error) {
                this.lastSessionError = error.getMessage();
                if (sessionOpen.get()) {
                    JSObject event = new JSObject();
                    event.put("sessionId", sessionId);
                    event.put("message", error.getMessage());
                    event.put("transport", "tcp");
                    notifyListeners("transportError", event);
                }
                call.reject("sendLanEvent failed: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void getSessionState(PluginCall call) {
        String requestedSessionId = call.getString("sessionId");
        if (
            requestedSessionId != null &&
            currentSessionId != null &&
            !requestedSessionId.equals(currentSessionId)
        ) {
            JSObject result = new JSObject();
            result.put("sessionId", requestedSessionId);
            result.put("state", "closed");
            result.put("transport", "tcp");
            result.put("lastError", "SESSION_NOT_FOUND");
            result.put("closedAt", System.currentTimeMillis());
            call.resolve(result);
            return;
        }

        JSObject result = new JSObject();
        if (currentSessionId != null) {
            result.put("sessionId", currentSessionId);
        }
        if (currentDeviceId != null) {
            result.put("deviceId", currentDeviceId);
        }
        if (currentHost != null) {
            result.put("host", currentHost);
        }
        if (currentPort != null) {
            result.put("port", currentPort);
        }
        result.put("state", sessionOpen.get() ? "open" : "closed");
        result.put("transport", "tcp");
        if (lastSessionError != null) {
            result.put("lastError", lastSessionError);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void pullHostEvents(PluginCall call) {
        JSObject response = new JSObject();
        response.put("events", new JSONArray());
        call.resolve(response);
    }

    @Override
    protected void handleOnDestroy() {
        closeSessionSocket();
        ioExecutor.shutdownNow();
        readerExecutor.shutdownNow();
        heartbeatExecutor.shutdownNow();
    }

    private void startSessionReader() {
        readerExecutor.submit(() -> {
            while (sessionOpen.get() && sessionInput != null) {
                try {
                    JSONObject frame = readFrame(sessionInput);
                    String type = frame.optString("type");
                    if ("message".equals(type)) {
                        JSONObject payload = frame.optJSONObject("payload");
                        JSObject event = new JSObject();
                        event.put("sessionId", frame.optString("sessionId"));
                        event.put("messageId", frame.optString("messageId"));
                        event.put(
                            "messageType",
                            payload == null ? "transport.message.received" : payload.optString("messageType", "transport.message.received")
                        );
                        event.put("payload", payload == null ? null : payload.opt("payload"));
                        event.put("timestamp", frame.optLong("timestamp", System.currentTimeMillis()));
                        event.put("transport", "tcp");
                        notifyListeners("messageReceived", event);
                    } else if ("ack".equals(type)) {
                        JSObject event = new JSObject();
                        event.put("sessionId", frame.optString("sessionId"));
                        event.put("messageId", frame.optString("messageId"));
                        event.put("timestamp", frame.optLong("timestamp", System.currentTimeMillis()));
                        event.put("transport", "tcp");
                        notifyListeners("messageAck", event);
                    } else if ("event".equals(type)) {
                        JSONObject pl = frame.optJSONObject("payload");
                        JSObject event = new JSObject();
                        event.put("sessionId", frame.optString("sessionId"));
                        event.put(
                            "eventName",
                            pl == null ? "" : pl.optString("eventName", "")
                        );
                        event.put("eventPayload", pl == null ? null : pl.opt("payload"));
                        event.put("transport", "tcp");
                        notifyListeners("lanWireEventReceived", event);
                    } else if ("heartbeat".equals(type)) {
                        // Keepalive frame from peer; no-op.
                    } else if ("close".equals(type)) {
                        JSObject event = new JSObject();
                        event.put("sessionId", frame.optString("sessionId"));
                        event.put("reason", "peer-closed");
                        event.put("transport", "tcp");
                        notifyListeners("sessionClosed", event);
                        closeSessionSocket();
                    }
                } catch (Exception error) {
                    if (error instanceof SocketTimeoutException) {
                        continue;
                    }
                    this.lastSessionError = error.getMessage();
                    if (sessionOpen.get()) {
                        JSObject event = new JSObject();
                        event.put("sessionId", currentSessionId);
                        event.put("message", error.getMessage());
                        event.put("transport", "tcp");
                        notifyListeners("transportError", event);
                    }
                    if (sessionOpen.get()
                        && currentSessionId != null
                        && !currentSessionId.isBlank()) {
                        JSObject closed = new JSObject();
                        closed.put("sessionId", currentSessionId);
                        closed.put("reason", "socket-closed");
                        closed.put("transport", "tcp");
                        notifyListeners("sessionClosed", closed);
                    }
                    closeSessionSocket();
                }
            }
        });
    }

    private JSObject frame(String type, String sessionId, String messageId, Object payload) {
        JSObject frame = new JSObject();
        frame.put("version", PROTOCOL_VERSION);
        frame.put("type", type);
        frame.put("sessionId", sessionId);
        frame.put("timestamp", System.currentTimeMillis());
        frame.put("appId", APP_ID);
        frame.put("protocolVersion", PROTOCOL_VERSION);
        frame.put("capabilities", new JSONArray().put("message").put("event"));
        if (messageId != null) {
            frame.put("messageId", messageId);
        }
        if (payload != null) {
            frame.put("payload", payload);
        }
        return frame;
    }

    private void writeFrame(DataOutputStream output, JSObject frame) throws IOException {
        byte[] payload = frame.toString().getBytes(StandardCharsets.UTF_8);
        output.writeInt(payload.length);
        output.write(payload);
        output.flush();
    }

    private JSONObject readFrame(DataInputStream input) throws IOException {
        int length = input.readInt();
        byte[] payload = new byte[length];
        input.readFully(payload);
        try {
            return new JSONObject(new String(payload, StandardCharsets.UTF_8));
        } catch (JSONException error) {
            throw new IOException("Invalid frame JSON payload.", error);
        }
    }

    private void closeSessionSocket() {
        stopHeartbeatLoop();
        this.sessionOpen.set(false);
        if (this.sessionSocket != null) {
            closeQuietly(this.sessionSocket);
            this.sessionSocket = null;
        }
        this.sessionInput = null;
        this.sessionOutput = null;
    }

    private synchronized void startHeartbeatLoop() {
        stopHeartbeatLoop();
        heartbeatTask =
            heartbeatExecutor.scheduleAtFixedRate(
                () -> {
                    if (!sessionOpen.get()) {
                        return;
                    }
                    DataOutputStream output = sessionOutput;
                    String sessionId = currentSessionId;
                    if (output == null || sessionId == null || sessionId.isBlank()) {
                        return;
                    }
                    try {
                        writeFrame(output, frame("heartbeat", sessionId, null, null));
                    } catch (Exception error) {
                        lastSessionError = error.getMessage();
                        if (sessionOpen.get()) {
                            JSObject event = new JSObject();
                            event.put("sessionId", sessionId);
                            event.put("message", error.getMessage());
                            event.put("transport", "tcp");
                            event.put("code", "HEARTBEAT_SEND_FAILED");
                            notifyListeners("transportError", event);
                        }
                        closeSessionSocket();
                    }
                },
                HEARTBEAT_INTERVAL_MS,
                HEARTBEAT_INTERVAL_MS,
                TimeUnit.MILLISECONDS
            );
    }

    private synchronized void stopHeartbeatLoop() {
        if (heartbeatTask != null) {
            heartbeatTask.cancel(true);
            heartbeatTask = null;
        }
    }

    private static void closeQuietly(Socket socket) {
        try {
            socket.close();
        } catch (IOException ignored) {
            // ignore
        }
    }

    private String localSynraDisplayName() {
        Context context = getContext();
        if (context == null) {
            return defaultDeviceNameFromUuid(UUID.randomUUID().toString());
        }
        android.content.SharedPreferences unified =
            context.getSharedPreferences(INSTANCE_PREFS_NAME, Context.MODE_PRIVATE);
        String rawBasic = unified.getString(DEVICE_BASIC_INFO_KEY, null);
        if (rawBasic != null && !rawBasic.isBlank()) {
            String parsed = parseBasicInfoDeviceName(rawBasic.trim());
            if (parsed != null && !parsed.isBlank()) {
                return parsed.trim();
            }
        }
        String legacy = unified.getString(LEGACY_DEVICE_DISPLAY_NAME_KEY, null);
        if (legacy != null && !legacy.isBlank()) {
            String trimmed = legacy.trim();
            try {
                JSONObject payload = new JSONObject();
                payload.put("deviceName", trimmed);
                unified.edit()
                    .putString(DEVICE_BASIC_INFO_KEY, payload.toString())
                    .remove(LEGACY_DEVICE_DISPLAY_NAME_KEY)
                    .apply();
            } catch (JSONException ignored) {
                // ignore
            }
            return trimmed;
        }
        String uuid = getOrCreateLocalDeviceUuid();
        String derived = defaultDeviceNameFromUuid(uuid);
        persistBasicInfoJson(unified, derived);
        return derived;
    }

    private static String parseBasicInfoDeviceName(String json) {
        try {
            JSONObject object = new JSONObject(json);
            String dn = object.optString("deviceName", "");
            if (dn.isBlank()) {
                return null;
            }
            return dn.trim();
        } catch (JSONException error) {
            return null;
        }
    }

    private static void persistBasicInfoJson(
        android.content.SharedPreferences unified,
        String deviceName
    ) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("deviceName", deviceName);
            unified.edit().putString(DEVICE_BASIC_INFO_KEY, payload.toString()).apply();
        } catch (JSONException ignored) {
            // ignore
        }
    }

    private static String defaultDeviceNameFromUuid(String uuid) {
        String raw = uuid.replace("-", "").toLowerCase(Locale.ROOT);
        if (raw.length() >= 6) {
            return raw.substring(0, 6);
        }
        return raw.isEmpty() ? "device" : raw;
    }

    private String getOrCreateLocalDeviceUuid() {
        Context context = getContext();
        if (context == null) {
            return UUID.randomUUID().toString();
        }
        android.content.SharedPreferences unified =
            context.getSharedPreferences(INSTANCE_PREFS_NAME, Context.MODE_PRIVATE);
        String existing = unified.getString(INSTANCE_UUID_KEY, null);
        if (existing != null && !existing.isBlank()) {
            return existing;
        }
        android.content.SharedPreferences legacy =
            context.getSharedPreferences(LEGACY_PREFS_NAME, Context.MODE_PRIVATE);
        String migrated = legacy.getString(LEGACY_PREFS_DEVICE_UUID_KEY, null);
        if (migrated != null && !migrated.isBlank()) {
            unified.edit().putString(INSTANCE_UUID_KEY, migrated).apply();
            legacy.edit().remove(LEGACY_PREFS_DEVICE_UUID_KEY).apply();
            return migrated;
        }
        String created = UUID.randomUUID().toString();
        unified.edit().putString(INSTANCE_UUID_KEY, created).apply();
        return created;
    }
}
