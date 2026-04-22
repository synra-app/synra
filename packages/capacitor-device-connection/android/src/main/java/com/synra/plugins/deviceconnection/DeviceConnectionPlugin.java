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

    private static JSONArray pairedPeerDeviceIdsFromHelloAck(JSONObject helloAckPayload) {
        JSONArray out = new JSONArray();
        if (helloAckPayload == null) {
            return out;
        }
        JSONArray raw = helloAckPayload.optJSONArray("pairedPeerDeviceIds");
        if (raw == null) {
            return out;
        }
        for (int i = 0; i < raw.length(); i++) {
            String id = raw.optString(i, null);
            if (id != null && !id.isBlank()) {
                out.put(id.trim());
            }
        }
        return out;
    }

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
                JSObject helloPayload = new JSObject();
                helloPayload.put("sourceDeviceId", getOrCreateLocalDeviceUuid());
                helloPayload.put("probe", false);
                helloPayload.put("displayName", localSynraDisplayName());
                writeFrame(output, frame("hello", sessionId, null, helloPayload));
                JSONObject helloAck = readFrame(input);
                if (!"helloAck".equals(helloAck.optString("type"))) {
                    call.reject("Handshake failed: missing helloAck.");
                    closeQuietly(socket);
                    return;
                }
                if (!APP_ID.equals(helloAck.optString("appId"))) {
                    call.reject("Handshake failed: appId mismatch.");
                    closeQuietly(socket);
                    return;
                }
                JSONObject helloAckPayload = helloAck.optJSONObject("payload");
                String remoteDeviceId =
                    helloAckPayload == null ? null : helloAckPayload.optString("sourceDeviceId", null);
                if (remoteDeviceId == null || remoteDeviceId.isBlank()) {
                    call.reject("Handshake failed: missing sourceDeviceId.");
                    closeQuietly(socket);
                    return;
                }
                socket.setSoTimeout(0);

                this.sessionSocket = socket;
                this.sessionInput = input;
                this.sessionOutput = output;
                this.currentSessionId = helloAck.optString("sessionId", sessionId);
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
                    helloAckPayload == null ? null : helloAckPayload.optString("displayName", null);
                if (remoteDisplay != null && !remoteDisplay.isBlank()) {
                    result.put("displayName", remoteDisplay.trim());
                }
                result.put("pairedPeerDeviceIds", pairedPeerDeviceIdsFromHelloAck(helloAckPayload));
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
        frame.put("capabilities", new JSONArray().put("message"));
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
