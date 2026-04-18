package com.synra.plugins.landiscovery;

import androidx.annotation.NonNull;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
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
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "LanDiscovery")
public class LanDiscoveryPluginPlugin extends Plugin {
    private static final int DEFAULT_TCP_PORT = 32100;
    private static final int DEFAULT_TIMEOUT_MS = 1500;
    private static final int SESSION_ACK_TIMEOUT_MS = 3000;
    private static final String APP_ID = "synra";
    private static final String PROTOCOL_VERSION = "1.0";

    private final LanDiscoveryPlugin implementation = new LanDiscoveryPlugin();
    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService readerExecutor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean sessionOpen = new AtomicBoolean(false);
    private Socket sessionSocket;
    private DataInputStream sessionInput;
    private DataOutputStream sessionOutput;
    private String currentSessionId;
    private String currentDeviceId;
    private String currentHost;
    private Integer currentPort;
    private String lastSessionError;

    @PluginMethod
    public void startDiscovery(PluginCall call) {
        boolean includeLoopback = call.getBoolean("includeLoopback", false);
        boolean enableProbeFallback = call.getBoolean("enableProbeFallback", true);
        boolean reset = call.getBoolean("reset", true);
        Integer scanWindowMs = call.getInt("scanWindowMs", null);
        int port = call.getInt("port", DEFAULT_TCP_PORT);
        int timeoutMs = call.getInt("timeoutMs", DEFAULT_TIMEOUT_MS);
        List<String> manualTargets = toStringList(call.getArray("manualTargets", new JSArray()));

        JSObject result = implementation.startDiscovery(
            includeLoopback,
            manualTargets,
            enableProbeFallback,
            reset,
            scanWindowMs
        );
        applyProbeToDevices(result, port, timeoutMs);

        JSObject scanStateEvent = new JSObject();
        scanStateEvent.put("state", result.optString("state"));
        if (result.has("startedAt")) {
            scanStateEvent.put("startedAt", result.optLong("startedAt"));
        }
        notifyListeners("scanStateChanged", scanStateEvent);

        JSONArray devices = result.optJSONArray("devices");
        if (devices != null) {
            for (int i = 0; i < devices.length(); i += 1) {
                JSONObject device = devices.optJSONObject(i);
                if (device == null) {
                    continue;
                }
                JSObject payload = new JSObject();
                payload.put("device", device);
                notifyListeners("deviceFound", payload);
            }
        }

        call.resolve(result);
    }

    @PluginMethod
    public void probeConnectable(PluginCall call) {
        int port = call.getInt("port", DEFAULT_TCP_PORT);
        int timeoutMs = call.getInt("timeoutMs", DEFAULT_TIMEOUT_MS);
        JSObject listed = implementation.listDevices();
        long checkedAt = applyProbeToDevices(listed, port, timeoutMs);

        JSObject response = new JSObject();
        response.put("checkedAt", checkedAt);
        response.put("port", port);
        response.put("timeoutMs", timeoutMs);
        response.put("devices", implementation.listDevices().optJSONArray("devices"));
        call.resolve(response);
    }

    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        JSObject result = implementation.stopDiscovery();
        JSObject payload = new JSObject();
        payload.put("state", "idle");
        notifyListeners("scanStateChanged", payload);
        call.resolve(result);
    }

    @PluginMethod
    public void getDiscoveredDevices(PluginCall call) {
        call.resolve(implementation.listDevices());
    }

    @PluginMethod
    public void pairDevice(PluginCall call) {
        String deviceId = call.getString("deviceId");
        if (deviceId == null || deviceId.isEmpty()) {
            call.reject("deviceId is required.");
            return;
        }

        JSObject result = implementation.pairDevice(deviceId);
        if (result == null) {
            call.reject("Target device was not found.");
            return;
        }

        JSObject payload = new JSObject();
        payload.put("device", result.optJSONObject("device"));
        notifyListeners("deviceUpdated", payload);
        call.resolve(result);
    }

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
                writeFrame(output, frame("hello", sessionId, null, null));
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
                socket.setSoTimeout(0);

                this.sessionSocket = socket;
                this.sessionInput = input;
                this.sessionOutput = output;
                this.currentSessionId = helloAck.optString("sessionId", sessionId);
                this.currentDeviceId = deviceId;
                this.currentHost = host;
                this.currentPort = port;
                this.lastSessionError = null;
                this.sessionOpen.set(true);

                startSessionReader();

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("sessionId", this.currentSessionId);
                result.put("state", "open");
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
        String type = call.getString("type");
        Object payload = call.getData().opt("payload");
        String messageId = call.getString("messageId", UUID.randomUUID().toString());

        if (sessionId == null || type == null) {
            call.reject("sessionId/type are required.");
            return;
        }

        ioExecutor.submit(() -> {
            if (!sessionOpen.get() || sessionOutput == null || sessionInput == null) {
                call.reject("Session is not open.");
                return;
            }

            try {
                JSObject envelope = new JSObject();
                envelope.put("type", type);
                envelope.put("value", payload);
                writeFrame(sessionOutput, frame("message", sessionId, messageId, envelope));

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("messageId", messageId);
                result.put("sessionId", sessionId);
                call.resolve(result);
            } catch (Exception error) {
                this.lastSessionError = error.getMessage();
                if (sessionOpen.get()) {
                    JSObject event = new JSObject();
                    event.put("sessionId", sessionId);
                    event.put("message", error.getMessage());
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
        if (lastSessionError != null) {
            result.put("lastError", lastSessionError);
        }
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        closeSessionSocket();
        ioExecutor.shutdownNow();
        readerExecutor.shutdownNow();
    }

    @NonNull
    private static List<String> toStringList(JSArray values) {
        List<String> result = new ArrayList<>();
        for (int i = 0; i < values.length(); i += 1) {
            result.add(values.optString(i));
        }
        return result;
    }

    private void startSessionReader() {
        readerExecutor.submit(() -> {
            while (sessionOpen.get() && sessionInput != null) {
                try {
                    JSONObject frame = readFrame(sessionInput);
                    String type = frame.optString("type");
                    if ("message".equals(type)) {
                        JSObject event = new JSObject();
                        event.put("sessionId", frame.optString("sessionId"));
                        event.put("messageId", frame.optString("messageId"));
                        event.put("type", "message");
                        event.put("payload", frame.opt("payload"));
                        event.put("timestamp", frame.optLong("timestamp", System.currentTimeMillis()));
                        notifyListeners("messageReceived", event);
                    } else if ("ack".equals(type)) {
                        JSObject event = new JSObject();
                        event.put("sessionId", frame.optString("sessionId"));
                        event.put("messageId", frame.optString("messageId"));
                        event.put("timestamp", frame.optLong("timestamp", System.currentTimeMillis()));
                        notifyListeners("messageAck", event);
                    } else if ("close".equals(type)) {
                        JSObject event = new JSObject();
                        event.put("sessionId", frame.optString("sessionId"));
                        event.put("reason", "peer-closed");
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
                        notifyListeners("transportError", event);
                    }
                    closeSessionSocket();
                }
            }
        });
    }

    private ProbeOutcome probeDevice(String host, int port, int timeoutMs) {
        Socket socket = new Socket();
        try {
            socket.connect(new InetSocketAddress(host, port), timeoutMs);
            socket.setSoTimeout(timeoutMs);
            DataInputStream input = new DataInputStream(new BufferedInputStream(socket.getInputStream()));
            DataOutputStream output = new DataOutputStream(new BufferedOutputStream(socket.getOutputStream()));
            writeFrame(output, frame("hello", UUID.randomUUID().toString(), null, null));
            JSONObject response = readFrame(input);
            if (!"helloAck".equals(response.optString("type"))) {
                return new ProbeOutcome(false, "MISSING_HELLO_ACK");
            }
            if (!APP_ID.equals(response.optString("appId"))) {
                return new ProbeOutcome(false, "APP_ID_MISMATCH");
            }
            return new ProbeOutcome(true, null);
        } catch (Exception error) {
            return new ProbeOutcome(false, error.getMessage());
        } finally {
            closeQuietly(socket);
        }
    }

    private long applyProbeToDevices(JSObject source, int port, int timeoutMs) {
        JSONArray devices = source.optJSONArray("devices");
        long checkedAt = System.currentTimeMillis();
        if (devices == null) {
            return checkedAt;
        }

        for (int i = 0; i < devices.length(); i += 1) {
            JSONObject device = devices.optJSONObject(i);
            if (device == null) {
                continue;
            }

            String deviceId = device.optString("deviceId");
            String host = device.optString("ipAddress");
            ProbeOutcome outcome = probeDevice(host, port, timeoutMs);
            LanDiscoveryPlugin.DeviceRecord updated = implementation.updateDeviceConnectable(
                deviceId,
                outcome.connectable,
                outcome.error
            );
            if (updated != null) {
                JSObject payload = new JSObject();
                payload.put("device", updated.toJSObject());
                notifyListeners("deviceConnectableUpdated", payload);
            }
        }

        return checkedAt;
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
        this.sessionOpen.set(false);
        if (this.sessionSocket != null) {
            closeQuietly(this.sessionSocket);
            this.sessionSocket = null;
        }
        this.sessionInput = null;
        this.sessionOutput = null;
    }

    private static void closeQuietly(Socket socket) {
        try {
            socket.close();
        } catch (IOException ignored) {
            // ignore
        }
    }

    private static final class ProbeOutcome {
        private final boolean connectable;
        private final String error;

        private ProbeOutcome(boolean connectable, String error) {
            this.connectable = connectable;
            this.error = error;
        }
    }
}
