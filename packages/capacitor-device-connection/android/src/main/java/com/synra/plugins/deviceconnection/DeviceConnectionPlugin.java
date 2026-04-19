package com.synra.plugins.deviceconnection;

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
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "DeviceConnection")
public class DeviceConnectionPlugin extends Plugin {
    private static final int SESSION_ACK_TIMEOUT_MS = 3000;
    private static final String APP_ID = "synra";
    private static final String PROTOCOL_VERSION = "1.0";

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
                result.put("transport", "tcp");
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
}
