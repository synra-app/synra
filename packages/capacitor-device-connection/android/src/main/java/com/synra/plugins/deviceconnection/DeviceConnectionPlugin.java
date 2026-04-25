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
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "DeviceConnection")
public class DeviceConnectionPlugin extends Plugin {
    private static final int CONNECT_ACK_TIMEOUT_MS = 6000;
    private static final int HEARTBEAT_INTERVAL_MS = 10_000;
    private static final int SYNRA_DEFAULT_TCP_PORT = 32100;
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
    private final ExecutorService inboundExecutor = Executors.newCachedThreadPool();
    private final ScheduledExecutorService heartbeatExecutor = Executors.newSingleThreadScheduledExecutor();
    private final AtomicBoolean primaryOutboundOpen = new AtomicBoolean(false);
    private final AtomicBoolean inboundServerRunning = new AtomicBoolean(false);
    private final Map<String, InboundConnectionContext> inboundConnections = new ConcurrentHashMap<>();
    private ScheduledFuture<?> heartbeatTask;
    private ServerSocket inboundServerSocket;
    private Socket primaryOutboundSocket;
    private DataInputStream primaryOutboundInput;
    private DataOutputStream primaryOutboundOutput;
    private String currentDeviceId;
    private String currentHost;
    private Integer currentPort;
    private String lastOutboundTransportError;

    private static final class InboundConnectionContext {
        final String connectionId;
        final Socket socket;
        final DataInputStream input;
        final DataOutputStream output;
        String canonicalDeviceId;
        String host;
        int port;

        InboundConnectionContext(
            String connectionId,
            Socket socket,
            DataInputStream input,
            DataOutputStream output
        ) {
            this.connectionId = connectionId;
            this.socket = socket;
            this.input = input;
            this.output = output;
        }
    }

    @Override
    public void load() {
        super.load();
        startInboundTcpServerIfNeeded();
    }

    @PluginMethod
    public void openTransport(PluginCall call) {
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
            closePrimaryOutboundSocket();
            try {
                Socket socket = new Socket();
                socket.connect(new InetSocketAddress(host, port), CONNECT_ACK_TIMEOUT_MS);
                socket.setSoTimeout(CONNECT_ACK_TIMEOUT_MS);
                DataInputStream input = new DataInputStream(new BufferedInputStream(socket.getInputStream()));
                DataOutputStream output =
                    new DataOutputStream(new BufferedOutputStream(socket.getOutputStream()));

                String connectRequestId = UUID.randomUUID().toString();
                JSObject connectPayload = new JSObject();
                connectPayload.put("sourceDeviceId", getOrCreateLocalDeviceUuid());
                connectPayload.put("probe", false);
                connectPayload.put("displayName", localSynraDisplayName());
                connectPayload.put("connectType", connectType.trim());
                writeFrame(
                    output,
                    synraLanFrame(
                        "connect",
                        connectRequestId,
                        null,
                        getOrCreateLocalDeviceUuid(),
                        canonicalSynraDeviceId(deviceId.trim()),
                        null,
                        connectPayload,
                        null
                    )
                );
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

                this.primaryOutboundSocket = socket;
                this.primaryOutboundInput = input;
                this.primaryOutboundOutput = output;
                // Match discovery / JS target: canonical dial id, not raw ack sourceDeviceId (may be instance UUID).
                this.currentDeviceId = canonicalSynraDeviceId(deviceId.trim());
                this.currentHost = host;
                this.currentPort = port;
                this.lastOutboundTransportError = null;
                this.primaryOutboundOpen.set(true);

                startHeartbeatLoop();
                startPrimaryOutboundReader();

                JSObject result = new JSObject();
                result.put("success", true);
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
                notifyListeners("transportOpened", result);
                call.resolve(result);
            } catch (Exception error) {
                this.lastOutboundTransportError = error.getMessage();
                this.primaryOutboundOpen.set(false);
                call.reject("openTransport failed: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void probeSynraPeers(PluginCall call) {
        JSONArray targets = call.getData().optJSONArray("targets");
        int timeoutMs = call.getInt("timeoutMs", 1500);
        if (targets == null || targets.length() == 0) {
            JSObject ret = new JSObject();
            ret.put("results", new JSONArray());
            call.resolve(ret);
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
            String connectRequestId = UUID.randomUUID().toString();
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
            writeFrame(
                output,
                synraLanFrame(
                    "connect",
                    connectRequestId,
                    null,
                    getOrCreateLocalDeviceUuid(),
                    null,
                    null,
                    probePayload,
                    null
                )
            );
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
    public void closeTransport(PluginCall call) {
        String targetDeviceId = call.getString("targetDeviceId", this.currentDeviceId);
        ioExecutor.submit(() -> {
            InboundConnectionContext inbound = findInboundByDeviceId(targetDeviceId);
            if (targetDeviceId != null && inbound != null && closeInboundByConnectionId(inbound.connectionId, "closed-by-client", true)) {
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("transport", "tcp");
                result.put("targetDeviceId", targetDeviceId);
                call.resolve(result);
                return;
            }
            closePrimaryOutboundSocket();
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("transport", "tcp");
            if (targetDeviceId != null) {
                result.put("targetDeviceId", targetDeviceId);
            }
            notifyListeners("transportClosed", result);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void sendMessage(PluginCall call) {
        String requestId = call.getString("requestId");
        String sourceDeviceId = call.getString("sourceDeviceId");
        String targetDeviceId = call.getString("targetDeviceId");
        String replyToRequestId = call.getString("replyToRequestId");
        String messageType = call.getString("messageType");
        Object payload = call.getData().opt("payload");
        String messageId = call.getString("messageId", UUID.randomUUID().toString());

        if (requestId == null || sourceDeviceId == null || targetDeviceId == null || messageType == null) {
            call.reject("requestId/sourceDeviceId/targetDeviceId/messageType are required.");
            return;
        }

        ioExecutor.submit(() -> {
            try {
                InboundConnectionContext inbound = findInboundByDeviceId(targetDeviceId);
                JSObject envelope = new JSObject();
                envelope.put("messageType", messageType);
                envelope.put("payload", payload);
                boolean outboundTargetsPeer =
                    primaryOutboundOpen.get()
                        && primaryOutboundOutput != null
                        && currentDeviceId != null
                        && currentDeviceId.equals(targetDeviceId);
                if (outboundTargetsPeer) {
                    writeFrame(
                        primaryOutboundOutput,
                        synraLanFrame(
                            "message",
                            requestId,
                            messageId,
                            sourceDeviceId,
                            targetDeviceId,
                            replyToRequestId,
                            envelope,
                            null
                        )
                    );
                } else if (inbound != null) {
                    writeFrame(
                        inbound.output,
                        synraLanFrame(
                            "message",
                            requestId,
                            messageId,
                            sourceDeviceId,
                            targetDeviceId,
                            replyToRequestId,
                            envelope,
                            null
                        )
                    );
                } else {
                    if (!primaryOutboundOpen.get() || primaryOutboundOutput == null || primaryOutboundInput == null) {
                        call.reject("Transport is not open.");
                        return;
                    }
                    writeFrame(
                        primaryOutboundOutput,
                        synraLanFrame(
                            "message",
                            requestId,
                            messageId,
                            sourceDeviceId,
                            targetDeviceId,
                            replyToRequestId,
                            envelope,
                            null
                        )
                    );
                }

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("messageId", messageId);
                result.put("targetDeviceId", targetDeviceId);
                result.put("transport", "tcp");
                call.resolve(result);
            } catch (Exception error) {
                this.lastOutboundTransportError = error.getMessage();
                if (primaryOutboundOpen.get()) {
                    JSObject event = new JSObject();
                    event.put("deviceId", targetDeviceId);
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
        String requestId = call.getString("requestId");
        String sourceDeviceId = call.getString("sourceDeviceId");
        String targetDeviceId = call.getString("targetDeviceId");
        String replyToRequestId = call.getString("replyToRequestId");
        String eventName = call.getString("eventName");
        Object payload = call.getData().opt("payload");
        String eventId = call.getString("eventId");
        Integer schemaVersion = call.getInt("schemaVersion");

        if (requestId == null || sourceDeviceId == null || targetDeviceId == null || eventName == null) {
            call.reject("requestId/sourceDeviceId/targetDeviceId/eventName are required.");
            return;
        }

        ioExecutor.submit(() -> {
            try {
                InboundConnectionContext inbound = findInboundByDeviceId(targetDeviceId);
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
                boolean outboundTargetsPeer =
                    primaryOutboundOpen.get()
                        && primaryOutboundOutput != null
                        && currentDeviceId != null
                        && currentDeviceId.equals(targetDeviceId);
                if (outboundTargetsPeer) {
                    writeFrame(
                        primaryOutboundOutput,
                        synraLanFrame(
                            "event",
                            requestId,
                            null,
                            sourceDeviceId,
                            targetDeviceId,
                            replyToRequestId,
                            envelope,
                            null
                        )
                    );
                } else if (inbound != null) {
                    writeFrame(
                        inbound.output,
                        synraLanFrame(
                            "event",
                            requestId,
                            null,
                            sourceDeviceId,
                            targetDeviceId,
                            replyToRequestId,
                            envelope,
                            null
                        )
                    );
                } else {
                    if (!primaryOutboundOpen.get() || primaryOutboundOutput == null || primaryOutboundInput == null) {
                        call.reject("Transport is not open.");
                        return;
                    }
                    writeFrame(
                        primaryOutboundOutput,
                        synraLanFrame(
                            "event",
                            requestId,
                            null,
                            sourceDeviceId,
                            targetDeviceId,
                            replyToRequestId,
                            envelope,
                            null
                        )
                    );
                }

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("targetDeviceId", targetDeviceId);
                result.put("transport", "tcp");
                call.resolve(result);
            } catch (Exception error) {
                this.lastOutboundTransportError = error.getMessage();
                if (primaryOutboundOpen.get()) {
                    JSObject event = new JSObject();
                    event.put("deviceId", targetDeviceId);
                    event.put("message", error.getMessage());
                    event.put("transport", "tcp");
                    notifyListeners("transportError", event);
                }
                call.reject("sendLanEvent failed: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void getTransportState(PluginCall call) {
        String targetDeviceId = call.getString("targetDeviceId");
        InboundConnectionContext inboundRequested = findInboundByDeviceId(targetDeviceId);
        if (targetDeviceId != null && inboundRequested != null) {
            JSObject result = new JSObject();
            result.put("deviceId", inboundRequested.canonicalDeviceId);
            result.put("host", inboundRequested.host);
            result.put("port", inboundRequested.port);
            result.put("state", "open");
            result.put("direction", "inbound");
            result.put("transport", "tcp");
            call.resolve(result);
            return;
        }
        if (targetDeviceId != null && currentDeviceId != null && !targetDeviceId.equals(currentDeviceId)) {
            JSObject result = new JSObject();
            result.put("deviceId", targetDeviceId);
            result.put("state", "closed");
            result.put("transport", "tcp");
            result.put("lastError", "TRANSPORT_PEER_NOT_FOUND");
            result.put("closedAt", System.currentTimeMillis());
            call.resolve(result);
            return;
        }

        if (targetDeviceId == null && !primaryOutboundOpen.get()) {
            InboundConnectionContext fallbackInbound = firstInboundConnection();
            if (fallbackInbound != null && fallbackInbound.canonicalDeviceId != null) {
                JSObject inboundResult = new JSObject();
                inboundResult.put("deviceId", fallbackInbound.canonicalDeviceId);
                inboundResult.put("host", fallbackInbound.host);
                inboundResult.put("port", fallbackInbound.port);
                inboundResult.put("state", "open");
                inboundResult.put("direction", "inbound");
                inboundResult.put("transport", "tcp");
                call.resolve(inboundResult);
                return;
            }
        }

        JSObject result = new JSObject();
        if (currentDeviceId != null) {
            result.put("deviceId", currentDeviceId);
        }
        if (currentHost != null) {
            result.put("host", currentHost);
        }
        if (currentPort != null) {
            result.put("port", currentPort);
        }
        result.put("state", primaryOutboundOpen.get() ? "open" : "closed");
        result.put("transport", "tcp");
        if (lastOutboundTransportError != null) {
            result.put("lastError", lastOutboundTransportError);
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
        stopInboundTcpServer();
        closePrimaryOutboundSocket();
        ioExecutor.shutdownNow();
        readerExecutor.shutdownNow();
        inboundExecutor.shutdownNow();
        heartbeatExecutor.shutdownNow();
    }

    private void startPrimaryOutboundReader() {
        readerExecutor.submit(() -> {
            while (primaryOutboundOpen.get() && primaryOutboundInput != null) {
                try {
                    JSONObject frame = readFrame(primaryOutboundInput);
                    String type = frame.optString("type");
                    if ("message".equals(type)) {
                        JSONObject payload = frame.optJSONObject("payload");
                        String sourceDeviceId = payload == null ? null : payload.optString("sourceDeviceId", null);
                        String targetDeviceId = payload == null ? null : payload.optString("targetDeviceId", null);
                        String topRid = frame.optString("requestId", null);
                        if (topRid == null || topRid.isBlank()) {
                            topRid = payload == null ? null : payload.optString("requestId", null);
                        }
                        JSObject event = new JSObject();
                        event.put("requestId", topRid);
                        event.put("sourceDeviceId", sourceDeviceId);
                        event.put("targetDeviceId", targetDeviceId);
                        if (payload != null && payload.has("replyToRequestId")) {
                            event.put("replyToRequestId", payload.opt("replyToRequestId"));
                        }
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
                        String targetDeviceId =
                            frame.has("targetDeviceId")
                                ? frame.optString("targetDeviceId", null)
                                : currentDeviceId;
                        JSObject event = new JSObject();
                        event.put("targetDeviceId", targetDeviceId);
                        event.put("requestId", frame.optString("requestId", null));
                        event.put("messageId", frame.optString("messageId"));
                        event.put("timestamp", frame.optLong("timestamp", System.currentTimeMillis()));
                        event.put("transport", "tcp");
                        notifyListeners("messageAck", event);
                    } else if ("event".equals(type)) {
                        JSONObject pl = frame.optJSONObject("payload");
                        JSObject event = new JSObject();
                        String evRid = frame.optString("requestId", null);
                        if (evRid == null || evRid.isBlank()) {
                            evRid = pl == null ? null : pl.optString("requestId", null);
                        }
                        event.put("requestId", evRid);
                        event.put(
                            "sourceDeviceId",
                            frame.has("sourceDeviceId") ? frame.opt("sourceDeviceId") : (pl == null ? null : pl.opt("sourceDeviceId"))
                        );
                        event.put(
                            "targetDeviceId",
                            frame.has("targetDeviceId") ? frame.opt("targetDeviceId") : (pl == null ? null : pl.opt("targetDeviceId"))
                        );
                        if (pl != null && pl.has("replyToRequestId")) {
                            event.put("replyToRequestId", pl.opt("replyToRequestId"));
                        }
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
                        event.put("deviceId", currentDeviceId);
                        event.put("reason", "peer-closed");
                        event.put("transport", "tcp");
                        notifyListeners("transportClosed", event);
                        closePrimaryOutboundSocket();
                    }
                } catch (Exception error) {
                    if (error instanceof SocketTimeoutException) {
                        continue;
                    }
                    this.lastOutboundTransportError = error.getMessage();
                    if (primaryOutboundOpen.get()) {
                        JSObject event = new JSObject();
                        event.put("deviceId", currentDeviceId);
                        event.put("message", error.getMessage());
                        event.put("transport", "tcp");
                        notifyListeners("transportError", event);
                    }
                    if (primaryOutboundOpen.get()) {
                        JSObject closed = new JSObject();
                        closed.put("deviceId", currentDeviceId);
                        closed.put("reason", "socket-closed");
                        closed.put("transport", "tcp");
                        notifyListeners("transportClosed", closed);
                    }
                    closePrimaryOutboundSocket();
                }
            }
        });
    }

    private synchronized void startInboundTcpServerIfNeeded() {
        if (inboundServerRunning.get()) {
            return;
        }
        inboundServerRunning.set(true);
        inboundExecutor.submit(() -> {
            try (ServerSocket server = new ServerSocket(SYNRA_DEFAULT_TCP_PORT)) {
                synchronized (this) {
                    inboundServerSocket = server;
                }
                while (inboundServerRunning.get()) {
                    Socket socket = server.accept();
                    socket.setSoTimeout(0);
                    inboundExecutor.submit(() -> handleInboundSocket(socket));
                }
            } catch (IOException error) {
                if (inboundServerRunning.get()) {
                    JSObject event = new JSObject();
                    event.put("transport", "tcp");
                    event.put("code", "TRANSPORT_IO_ERROR");
                    event.put("message", error.getMessage() == null ? "INBOUND_SERVER_FAILED" : error.getMessage());
                    notifyListeners("transportError", event);
                }
            } finally {
                synchronized (this) {
                    inboundServerSocket = null;
                }
                inboundServerRunning.set(false);
            }
        });
    }

    private synchronized void stopInboundTcpServer() {
        inboundServerRunning.set(false);
        if (inboundServerSocket != null) {
            try {
                inboundServerSocket.close();
            } catch (IOException ignored) {
                // ignore
            } finally {
                inboundServerSocket = null;
            }
        }
        for (String connectionId : inboundConnections.keySet()) {
            closeInboundByConnectionId(connectionId, "server-stopped", true);
        }
    }

    private void handleInboundSocket(Socket socket) {
        String activeConnectionId = null;
        InboundConnectionContext activeContext = null;
        boolean closed = false;
        try {
            DataInputStream input = new DataInputStream(new BufferedInputStream(socket.getInputStream()));
            DataOutputStream output = new DataOutputStream(new BufferedOutputStream(socket.getOutputStream()));
            while (true) {
                JSONObject inbound = readFrame(input);
                String frameType = inbound.optString("type");
                if ("connect".equals(frameType)) {
                    String connectRequestId = inbound.optString("requestId", null);
                    if (connectRequestId == null || connectRequestId.isBlank()) {
                        connectRequestId = UUID.randomUUID().toString();
                    }
                    JSONObject payload = inbound.optJSONObject("payload");
                    String sourceDeviceId =
                        payload == null ? null : payload.optString("sourceDeviceId", null);
                    if (!APP_ID.equals(inbound.optString("appId")) ||
                        sourceDeviceId == null ||
                        sourceDeviceId.isBlank()) {
                        writeFrame(
                            output,
                            synraLanFrame(
                                "error",
                                connectRequestId,
                                null,
                                getOrCreateLocalDeviceUuid(),
                                null,
                                null,
                                null,
                                "CONNECT_INVALID"
                            )
                        );
                        closeQuietly(socket);
                        return;
                    }
                    String canonicalDeviceId = canonicalSynraDeviceId(sourceDeviceId.trim());
                    JSONObject ackPayload = new JSONObject();
                    ackPayload.put("sourceDeviceId", getOrCreateLocalDeviceUuid());
                    ackPayload.put("displayName", localSynraDisplayName());
                    String localHost = socket.getLocalAddress() == null
                        ? null
                        : socket.getLocalAddress().getHostAddress();
                    if (isIpv4Address(localHost)) {
                        ackPayload.put("sourceHostIp", localHost);
                    }
                    String observedPeerHost = socket.getInetAddress() == null
                        ? null
                        : socket.getInetAddress().getHostAddress();
                    if (isIpv4Address(observedPeerHost)) {
                        ackPayload.put("observedPeerIp", observedPeerHost);
                    }
                    writeFrame(
                        output,
                        synraLanFrame(
                            "connectAck",
                            connectRequestId,
                            null,
                            getOrCreateLocalDeviceUuid(),
                            canonicalDeviceId,
                            null,
                            ackPayload,
                            null
                        )
                    );
                    boolean probe = payload != null && payload.optBoolean("probe", false);
                    if (probe) {
                        closeQuietly(socket);
                        return;
                    }
                    InboundConnectionContext context = new InboundConnectionContext(
                        UUID.randomUUID().toString(),
                        socket,
                        input,
                        output
                    );
                    context.canonicalDeviceId = canonicalDeviceId;
                    context.host = resolveInboundHost(payload, socket);
                    context.port = SYNRA_DEFAULT_TCP_PORT;
                    inboundConnections.put(context.connectionId, context);
                    activeContext = context;
                    activeConnectionId = context.connectionId;
                    JSObject opened = new JSObject();
                    opened.put("deviceId", canonicalDeviceId);
                    opened.put("direction", "inbound");
                    opened.put("transport", "tcp");
                    opened.put("host", context.host);
                    opened.put("port", context.port);
                    String peerDisplayName =
                        payload == null ? null : payload.optString("displayName", null);
                    if (peerDisplayName != null && !peerDisplayName.isBlank()) {
                        opened.put("displayName", peerDisplayName.trim());
                    }
                    try {
                        opened.put("connectAckPayload", JSObject.fromJSONObject(ackPayload));
                    } catch (Exception ignored) {
                        // ignore payload conversion failure
                    }
                    if (payload != null) {
                        try {
                            opened.put("incomingSynraConnectPayload", JSObject.fromJSONObject(payload));
                        } catch (Exception ignored) {
                            // ignore payload conversion failure
                        }
                    }
                    notifyListeners("transportOpened", opened);
                    continue;
                }
                if (activeContext == null) {
                    writeFrame(
                        output,
                        synraLanFrame(
                            "error",
                            inbound.optString("requestId", UUID.randomUUID().toString()),
                            null,
                            getOrCreateLocalDeviceUuid(),
                            null,
                            null,
                            null,
                            "CONNECT_NOT_ESTABLISHED"
                        )
                    );
                    continue;
                }
                if ("message".equals(frameType)) {
                    JSONObject messagePayload = inbound.optJSONObject("payload");
                    JSObject event = new JSObject();
                    String topRid = inbound.optString("requestId", null);
                    if (topRid == null || topRid.isBlank()) {
                        topRid = messagePayload == null ? null : messagePayload.optString("requestId", null);
                    }
                    event.put("requestId", topRid);
                    event.put(
                        "sourceDeviceId",
                        inbound.has("sourceDeviceId")
                            ? inbound.opt("sourceDeviceId")
                            : (messagePayload == null ? null : messagePayload.opt("sourceDeviceId"))
                    );
                    event.put(
                        "targetDeviceId",
                        inbound.has("targetDeviceId")
                            ? inbound.opt("targetDeviceId")
                            : (messagePayload == null ? null : messagePayload.opt("targetDeviceId"))
                    );
                    if (messagePayload != null && messagePayload.has("replyToRequestId")) {
                        event.put("replyToRequestId", messagePayload.opt("replyToRequestId"));
                    } else if (inbound.has("replyToRequestId")) {
                        event.put("replyToRequestId", inbound.opt("replyToRequestId"));
                    }
                    event.put("messageId", inbound.optString("messageId"));
                    event.put(
                        "messageType",
                        messagePayload == null ? "transport.message.received" : messagePayload.optString("messageType", "transport.message.received")
                    );
                    event.put("payload", messagePayload == null ? null : messagePayload.opt("payload"));
                    event.put("timestamp", inbound.optLong("timestamp", System.currentTimeMillis()));
                    event.put("transport", "tcp");
                    notifyListeners("messageReceived", event);
                    String messageId = inbound.optString("messageId", null);
                    if (messageId != null && !messageId.isBlank()) {
                        String ackRid = inbound.optString("requestId", null);
                        if (ackRid == null || ackRid.isBlank()) {
                            ackRid = UUID.randomUUID().toString();
                        }
                        writeFrame(
                            output,
                            synraLanFrame(
                                "ack",
                                ackRid,
                                messageId,
                                getOrCreateLocalDeviceUuid(),
                                activeContext.canonicalDeviceId,
                                null,
                                null,
                                null
                            )
                        );
                    }
                    continue;
                }
                if ("event".equals(frameType)) {
                    JSONObject eventPayload = inbound.optJSONObject("payload");
                    JSObject event = new JSObject();
                    String topEvRid = inbound.optString("requestId", null);
                    if (topEvRid == null || topEvRid.isBlank()) {
                        topEvRid = eventPayload == null ? null : eventPayload.optString("requestId", null);
                    }
                    event.put("requestId", topEvRid);
                    event.put(
                        "sourceDeviceId",
                        inbound.has("sourceDeviceId")
                            ? inbound.opt("sourceDeviceId")
                            : (eventPayload == null ? null : eventPayload.opt("sourceDeviceId"))
                    );
                    event.put(
                        "targetDeviceId",
                        inbound.has("targetDeviceId")
                            ? inbound.opt("targetDeviceId")
                            : (eventPayload == null ? null : eventPayload.opt("targetDeviceId"))
                    );
                    if (eventPayload != null && eventPayload.has("replyToRequestId")) {
                        event.put("replyToRequestId", eventPayload.opt("replyToRequestId"));
                    } else if (inbound.has("replyToRequestId")) {
                        event.put("replyToRequestId", inbound.opt("replyToRequestId"));
                    }
                    event.put(
                        "eventName",
                        eventPayload == null ? "" : eventPayload.optString("eventName", "")
                    );
                    event.put("eventPayload", eventPayload == null ? null : eventPayload.opt("payload"));
                    event.put("transport", "tcp");
                    notifyListeners("lanWireEventReceived", event);
                    continue;
                }
                if ("heartbeat".equals(frameType)) {
                    continue;
                }
                if ("close".equals(frameType)) {
                    if (activeConnectionId != null) {
                        closeInboundByConnectionId(activeConnectionId, "peer-closed", true);
                    }
                    closed = true;
                    return;
                }
            }
        } catch (Exception error) {
            if (activeConnectionId != null && !activeConnectionId.isBlank()) {
                JSObject event = new JSObject();
                InboundConnectionContext context = inboundConnections.get(activeConnectionId);
                event.put("deviceId", context == null ? null : context.canonicalDeviceId);
                event.put("message", error.getMessage());
                event.put("transport", "tcp");
                notifyListeners("transportError", event);
            }
        } finally {
            if (!closed) {
                if (activeConnectionId != null && !activeConnectionId.isBlank()) {
                    closeInboundByConnectionId(activeConnectionId, "socket-closed", true);
                } else {
                    closeQuietly(socket);
                }
            }
        }
    }

    private boolean closeInboundByConnectionId(String connectionId, String reason, boolean emitClosedEvent) {
        InboundConnectionContext context = inboundConnections.remove(connectionId);
        if (context == null) {
            return false;
        }
        closeQuietly(context.socket);
        if (emitClosedEvent && context.canonicalDeviceId != null && !context.canonicalDeviceId.isBlank()) {
            JSObject event = new JSObject();
            event.put("deviceId", context.canonicalDeviceId);
            event.put("reason", reason);
            event.put("transport", "tcp");
            notifyListeners("transportClosed", event);
        }
        return true;
    }

    private InboundConnectionContext findInboundByDeviceId(String deviceId) {
        if (deviceId == null || deviceId.isBlank()) {
            return null;
        }
        for (InboundConnectionContext context : inboundConnections.values()) {
            if (deviceId.equals(context.canonicalDeviceId)) {
                return context;
            }
        }
        return null;
    }

    private InboundConnectionContext firstInboundConnection() {
        for (InboundConnectionContext context : inboundConnections.values()) {
            if (context.canonicalDeviceId != null && !context.canonicalDeviceId.isBlank()) {
                return context;
            }
        }
        return null;
    }

    private String resolveInboundHost(JSONObject connectPayload, Socket socket) {
        if (connectPayload != null) {
            String sourceHostIp = connectPayload.optString("sourceHostIp", "");
            if (isIpv4Address(sourceHostIp)) {
                return sourceHostIp.trim();
            }
        }
        if (socket.getInetAddress() != null) {
            String observed = socket.getInetAddress().getHostAddress();
            if (isIpv4Address(observed)) {
                return observed.trim();
            }
        }
        return currentHost == null ? "" : currentHost;
    }

    private boolean isIpv4Address(String value) {
        if (value == null) {
            return false;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return false;
        }
        String[] parts = trimmed.split("\\.");
        if (parts.length != 4) {
            return false;
        }
        for (String part : parts) {
            try {
                int valuePart = Integer.parseInt(part);
                if (valuePart < 0 || valuePart > 255) {
                    return false;
                }
            } catch (NumberFormatException error) {
                return false;
            }
        }
        return true;
    }

    private JSObject synraLanFrame(
        String type,
        String requestId,
        String messageId,
        String sourceDeviceId,
        String targetDeviceId,
        String replyToRequestId,
        Object payload,
        String error
    ) {
        JSObject frame = new JSObject();
        frame.put("version", PROTOCOL_VERSION);
        frame.put("type", type);
        frame.put("requestId", requestId);
        frame.put("timestamp", System.currentTimeMillis());
        frame.put("appId", APP_ID);
        frame.put("protocolVersion", PROTOCOL_VERSION);
        frame.put("capabilities", new JSONArray().put("message").put("event"));
        if (messageId != null && !messageId.isBlank()) {
            frame.put("messageId", messageId);
        }
        if (sourceDeviceId != null && !sourceDeviceId.isBlank()) {
            frame.put("sourceDeviceId", sourceDeviceId);
        }
        if (targetDeviceId != null && !targetDeviceId.isBlank()) {
            frame.put("targetDeviceId", targetDeviceId);
        }
        if (replyToRequestId != null && !replyToRequestId.isBlank()) {
            frame.put("replyToRequestId", replyToRequestId);
        }
        if (payload != null) {
            frame.put("payload", payload);
        }
        if (error != null && !error.isBlank()) {
            frame.put("error", error);
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

    private void closePrimaryOutboundSocket() {
        stopHeartbeatLoop();
        this.primaryOutboundOpen.set(false);
        if (this.primaryOutboundSocket != null) {
            closeQuietly(this.primaryOutboundSocket);
            this.primaryOutboundSocket = null;
        }
        this.primaryOutboundInput = null;
        this.primaryOutboundOutput = null;
    }

    private synchronized void startHeartbeatLoop() {
        stopHeartbeatLoop();
        heartbeatTask =
            heartbeatExecutor.scheduleAtFixedRate(
                () -> {
                    if (!primaryOutboundOpen.get()) {
                        return;
                    }
                    DataOutputStream output = primaryOutboundOutput;
                    if (output == null || currentDeviceId == null || currentDeviceId.isBlank()) {
                        return;
                    }
                    try {
                        writeFrame(
                            output,
                            synraLanFrame(
                                "heartbeat",
                                UUID.randomUUID().toString(),
                                null,
                                getOrCreateLocalDeviceUuid(),
                                canonicalSynraDeviceId(currentDeviceId),
                                null,
                                null,
                                null
                            )
                        );
                    } catch (Exception error) {
                        lastOutboundTransportError = error.getMessage();
                        if (primaryOutboundOpen.get()) {
                            JSObject event = new JSObject();
                            event.put("deviceId", currentDeviceId);
                            event.put("message", error.getMessage());
                            event.put("transport", "tcp");
                            event.put("code", "HEARTBEAT_SEND_FAILED");
                            notifyListeners("transportError", event);
                        }
                        closePrimaryOutboundSocket();
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
