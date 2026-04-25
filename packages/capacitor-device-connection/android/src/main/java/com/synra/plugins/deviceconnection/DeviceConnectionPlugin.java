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
    private static final int MAX_FRAME_BYTES = 256 * 1024;
    private static final String APP_ID = "synra";
    private static final String DEVICE_TCP_CONNECT_EVENT = "device.tcp.connect";
    private static final String DEVICE_TCP_CONNECT_ACK_EVENT = "device.tcp.connect.ack";
    private static final String DEVICE_TCP_ACK_EVENT = "device.tcp.ack";
    private static final String DEVICE_TCP_CLOSE_EVENT = "device.tcp.close";
    private static final String DEVICE_TCP_ERROR_EVENT = "device.tcp.error";
    private static final String DEVICE_TCP_HEARTBEAT_EVENT = "device.tcp.heartbeat";
    private static final String DEVICE_DISPLAY_NAME_CHANGED_EVENT = "device.display-name.changed";
    private static final String DEVICE_PAIRING_EVENT_PREFIX = "device.pairing.";
    private static final String LEGACY_TYPE_CONNECT = "connect";
    private static final String LEGACY_TYPE_CONNECT_ACK = "connectAck";
    private static final String LEGACY_TYPE_ACK = "ack";
    private static final String LEGACY_TYPE_CLOSE = "close";
    private static final String LEGACY_TYPE_ERROR = "error";
    private static final String LEGACY_TYPE_HEARTBEAT = "heartbeat";
    private static final String ERROR_CODE_TRANSPORT_IO_ERROR = "TRANSPORT_IO_ERROR";
    private static final String ERROR_CODE_HEARTBEAT_SEND_FAILED = "HEARTBEAT_SEND_FAILED";
    private static final String ERROR_CODE_CONNECT_INVALID = "CONNECT_INVALID";
    private static final String ERROR_CODE_CONNECT_NOT_ESTABLISHED = "CONNECT_NOT_ESTABLISHED";
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
                connectPayload.put("appId", APP_ID);
                connectPayload.put("from", getOrCreateLocalDeviceUuid());
                connectPayload.put("probe", false);
                connectPayload.put("displayName", localSynraDisplayName());
                connectPayload.put("connectType", connectType.trim());
                writeFrame(
                    output,
                    synraLanFrame(
                        LEGACY_TYPE_CONNECT,
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
                if (!DEVICE_TCP_CONNECT_ACK_EVENT.equals(connectAck.optString("event"))) {
                    call.reject("Connect failed: missing connectAck.");
                    closeQuietly(socket);
                    return;
                }
                JSONObject ackPayload = connectAck.optJSONObject("payload");
                if (ackPayload == null || !APP_ID.equals(ackPayload.optString("appId"))) {
                    call.reject("Connect failed: appId mismatch.");
                    closeQuietly(socket);
                    return;
                }
                String remoteDeviceId =
                    ackPayload == null ? null : ackPayload.optString("from", null);
                if (remoteDeviceId == null || remoteDeviceId.isBlank()) {
                    call.reject("Connect failed: missing from.");
                    closeQuietly(socket);
                    return;
                }
                socket.setSoTimeout(0);

                this.primaryOutboundSocket = socket;
                this.primaryOutboundInput = input;
                this.primaryOutboundOutput = output;
                // Match discovery / JS target: canonical dial id, not raw ack from (may be instance UUID).
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
            probePayload.put("appId", APP_ID);
            probePayload.put("from", getOrCreateLocalDeviceUuid());
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
                    LEGACY_TYPE_CONNECT,
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
            if (!DEVICE_TCP_CONNECT_ACK_EVENT.equals(response.optString("event"))) {
                base.put("error", "CONNECT_ACK_INVALID");
                return base;
            }
            JSONObject ackPayload = response.optJSONObject("payload");
            if (ackPayload == null) {
                base.put("error", "MISSING_ACK_PAYLOAD");
                return base;
            }
            if (!APP_ID.equals(ackPayload.optString("appId"))) {
                base.put("error", "APP_ID_MISMATCH");
                return base;
            }
            String remote = ackPayload.optString("from", null);
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
        String target = call.getString("target", this.currentDeviceId);
        ioExecutor.submit(() -> {
            InboundConnectionContext inbound = findInboundByDeviceId(target);
            if (target != null && inbound != null && closeInboundByConnectionId(inbound.connectionId, "closed-by-client", true)) {
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("transport", "tcp");
                result.put("target", target);
                call.resolve(result);
                return;
            }
            closePrimaryOutboundSocket();
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("transport", "tcp");
            if (target != null) {
                result.put("target", target);
            }
            notifyListeners("transportClosed", result);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void sendMessage(PluginCall call) {
        String requestId = call.getString("requestId");
        String from = call.getString("from");
        String target = call.getString("target");
        String replyRequestId = call.getString("replyRequestId");
        String event = call.getString("event");
        Object payload = call.getData().opt("payload");

        if (requestId == null || from == null || target == null || event == null) {
            call.reject("requestId/from/target/event are required.");
            return;
        }

        ioExecutor.submit(() -> {
            try {
                InboundConnectionContext inbound = findInboundByDeviceId(target);
                boolean outboundTargetsPeer =
                    primaryOutboundOpen.get()
                        && primaryOutboundOutput != null
                        && currentDeviceId != null
                        && currentDeviceId.equals(target);
                if (outboundTargetsPeer) {
                    writeFrame(
                        primaryOutboundOutput,
                        synraLanFrame(
                            "message",
                            requestId,
                            event,
                            from,
                            target,
                            replyRequestId,
                            payload,
                            null
                        )
                    );
                } else if (inbound != null) {
                    writeFrame(
                        inbound.output,
                        synraLanFrame(
                            "message",
                            requestId,
                            event,
                            from,
                            target,
                            replyRequestId,
                            payload,
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
                            event,
                            from,
                            target,
                            replyRequestId,
                            payload,
                            null
                        )
                    );
                }

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("target", target);
                result.put("transport", "tcp");
                call.resolve(result);
            } catch (Exception error) {
                this.lastOutboundTransportError = error.getMessage();
                if (primaryOutboundOpen.get()) {
                    JSObject transportErrorEvent = new JSObject();
                    transportErrorEvent.put("deviceId", target);
                    transportErrorEvent.put("message", error.getMessage());
                    transportErrorEvent.put("transport", "tcp");
                    notifyListeners("transportError", transportErrorEvent);
                }
                call.reject("sendMessage failed: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void sendLanEvent(PluginCall call) {
        String requestId = call.getString("requestId");
        String from = call.getString("from");
        String target = call.getString("target");
        String replyRequestId = call.getString("replyRequestId");
        String event = call.getString("event");
        Object payload = call.getData().opt("payload");
        Long timestamp = call.getLong("timestamp");

        if (requestId == null || from == null || target == null || event == null) {
            call.reject("requestId/from/target/event are required.");
            return;
        }

        ioExecutor.submit(() -> {
            try {
                InboundConnectionContext inbound = findInboundByDeviceId(target);
                boolean outboundTargetsPeer =
                    primaryOutboundOpen.get()
                        && primaryOutboundOutput != null
                        && currentDeviceId != null
                        && currentDeviceId.equals(target);
                if (outboundTargetsPeer) {
                    writeFrame(
                        primaryOutboundOutput,
                        synraLanFrame(
                            "event",
                            requestId,
                            event,
                            from,
                            target,
                            replyRequestId,
                            payload,
                            null
                        )
                    );
                } else if (inbound != null) {
                    writeFrame(
                        inbound.output,
                        synraLanFrame(
                            "event",
                            requestId,
                            event,
                            from,
                            target,
                            replyRequestId,
                            payload,
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
                            event,
                            from,
                            target,
                            replyRequestId,
                            payload,
                            null
                        )
                    );
                }

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("target", target);
                if (timestamp != null) {
                    result.put("timestamp", timestamp);
                }
                result.put("transport", "tcp");
                call.resolve(result);
            } catch (Exception error) {
                this.lastOutboundTransportError = error.getMessage();
                if (primaryOutboundOpen.get()) {
                    JSObject transportErrorEvent = new JSObject();
                    transportErrorEvent.put("deviceId", target);
                    transportErrorEvent.put("message", error.getMessage());
                    transportErrorEvent.put("transport", "tcp");
                    notifyListeners("transportError", transportErrorEvent);
                }
                call.reject("sendLanEvent failed: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void getTransportState(PluginCall call) {
        String target = call.getString("target");
        InboundConnectionContext inboundRequested = findInboundByDeviceId(target);
        if (target != null && inboundRequested != null) {
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
        if (target != null && currentDeviceId != null && !target.equals(currentDeviceId)) {
            JSObject result = new JSObject();
            result.put("deviceId", target);
            result.put("state", "closed");
            result.put("transport", "tcp");
            result.put("lastError", "TRANSPORT_PEER_NOT_FOUND");
            result.put("closedAt", System.currentTimeMillis());
            call.resolve(result);
            return;
        }

        if (target == null && !primaryOutboundOpen.get()) {
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
                    String wireEvent = frame.optString("event");
                    if (DEVICE_TCP_ACK_EVENT.equals(wireEvent)) {
                        String target =
                            frame.has("target")
                                ? frame.optString("target", null)
                                : currentDeviceId;
                        JSObject event = new JSObject();
                        event.put("target", target);
                        event.put("requestId", frame.optString("requestId", null));
                        event.put("replyRequestId", frame.optString("replyRequestId", null));
                        event.put("event", frame.optString("event", null));
                        event.put("from", frame.optString("from", null));
                        event.put("timestamp", frame.optLong("timestamp", System.currentTimeMillis()));
                        event.put("transport", "tcp");
                        notifyListeners("messageAck", event);
                    } else if (DEVICE_TCP_HEARTBEAT_EVENT.equals(wireEvent)) {
                        // Keepalive frame from peer; no-op.
                    } else if (DEVICE_TCP_ERROR_EVENT.equals(wireEvent)) {
                        notifyListeners("transportError", buildTransportErrorEventFromWire(frame, currentDeviceId));
                    } else if (DEVICE_TCP_CLOSE_EVENT.equals(wireEvent)) {
                        JSObject event = new JSObject();
                        event.put("deviceId", currentDeviceId);
                        event.put("reason", "peer-closed");
                        event.put("transport", "tcp");
                        notifyListeners("transportClosed", event);
                        closePrimaryOutboundSocket();
                    } else if (!isTransportControlEvent(wireEvent)) {
                        String topRid = frame.optString("requestId", null);
                        JSObject event = new JSObject();
                        event.put("requestId", topRid);
                        event.put("from", frame.opt("from"));
                        event.put("target", frame.opt("target"));
                        if (frame.has("replyRequestId")) {
                            event.put("replyRequestId", frame.opt("replyRequestId"));
                        }
                        event.put("event", frame.optString("event", ""));
                        event.put("payload", frame.opt("payload"));
                        event.put("timestamp", frame.optLong("timestamp", System.currentTimeMillis()));
                        event.put("transport", "tcp");
                        if (isLanWireEvent(wireEvent)) {
                            notifyListeners("lanWireEventReceived", event);
                        } else {
                            notifyListeners("messageReceived", event);
                        }
                        if (topRid != null && !topRid.isBlank() && primaryOutboundOutput != null) {
                            String ackRid = topRid;
                            String ackTarget =
                                frame.has("target")
                                    ? frame.optString("target", currentDeviceId)
                                    : currentDeviceId;
                            writeFrame(
                                primaryOutboundOutput,
                                synraLanFrame(
                                    LEGACY_TYPE_ACK,
                                    ackRid,
                                    frame.optString("event", "transport.message.received"),
                                    getOrCreateLocalDeviceUuid(),
                                    ackTarget,
                                    topRid,
                                    null,
                                    null
                                )
                            );
                        }
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
                    event.put("code", ERROR_CODE_TRANSPORT_IO_ERROR);
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
                String wireEvent = inbound.optString("event");
                if (DEVICE_TCP_CONNECT_EVENT.equals(wireEvent)) {
                    String connectRequestId = inbound.optString("requestId", null);
                    if (connectRequestId == null || connectRequestId.isBlank()) {
                        connectRequestId = UUID.randomUUID().toString();
                    }
                    JSONObject payload = inbound.optJSONObject("payload");
                    String from =
                        payload == null ? null : payload.optString("from", null);
                    if (payload == null ||
                        !APP_ID.equals(payload.optString("appId")) ||
                        from == null ||
                        from.isBlank()) {
                        writeFrame(
                            output,
                            synraLanFrame(
                                LEGACY_TYPE_ERROR,
                                connectRequestId,
                                null,
                                getOrCreateLocalDeviceUuid(),
                                null,
                                null,
                                null,
                                ERROR_CODE_CONNECT_INVALID
                            )
                        );
                        closeQuietly(socket);
                        return;
                    }
                    String canonicalDeviceId = canonicalSynraDeviceId(from.trim());
                    JSONObject ackPayload = new JSONObject();
                    ackPayload.put("appId", APP_ID);
                    ackPayload.put("from", getOrCreateLocalDeviceUuid());
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
                            LEGACY_TYPE_CONNECT_ACK,
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
                            LEGACY_TYPE_ERROR,
                            inbound.optString("requestId", UUID.randomUUID().toString()),
                            null,
                            getOrCreateLocalDeviceUuid(),
                            null,
                            null,
                            null,
                            ERROR_CODE_CONNECT_NOT_ESTABLISHED
                        )
                    );
                    continue;
                }
                if (!isTransportControlEvent(wireEvent)) {
                    JSObject event = new JSObject();
                    String topRid = inbound.optString("requestId", null);
                    event.put("requestId", topRid);
                    event.put("from", inbound.opt("from"));
                    event.put("target", inbound.opt("target"));
                    if (inbound.has("replyRequestId")) {
                        event.put("replyRequestId", inbound.opt("replyRequestId"));
                    }
                    event.put("event", inbound.optString("event", ""));
                    event.put("payload", inbound.opt("payload"));
                    event.put("timestamp", inbound.optLong("timestamp", System.currentTimeMillis()));
                    event.put("transport", "tcp");
                    if (isLanWireEvent(wireEvent)) {
                        notifyListeners("lanWireEventReceived", event);
                    } else {
                        notifyListeners("messageReceived", event);
                    }
                    if (topRid != null && !topRid.isBlank()) {
                        String ackRid = inbound.optString("requestId", null);
                        if (ackRid == null || ackRid.isBlank()) {
                            ackRid = UUID.randomUUID().toString();
                        }
                        String ackTarget =
                            inbound.has("target")
                                ? inbound.optString("target", activeContext.canonicalDeviceId)
                                : activeContext.canonicalDeviceId;
                        writeFrame(
                            output,
                            synraLanFrame(
                                LEGACY_TYPE_ACK,
                                ackRid,
                                inbound.optString("event", "transport.message.received"),
                                getOrCreateLocalDeviceUuid(),
                                ackTarget,
                                topRid,
                                null,
                                null
                            )
                        );
                    }
                    continue;
                }
                if (DEVICE_TCP_HEARTBEAT_EVENT.equals(wireEvent)) {
                    continue;
                }
                if (DEVICE_TCP_ERROR_EVENT.equals(wireEvent)) {
                    notifyListeners(
                        "transportError",
                        buildTransportErrorEventFromWire(
                            inbound,
                            activeContext == null ? null : activeContext.canonicalDeviceId
                        )
                    );
                    continue;
                }
                if (DEVICE_TCP_CLOSE_EVENT.equals(wireEvent)) {
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

    private String mapWireEventName(String legacyType, String appEvent) {
        if (LEGACY_TYPE_CONNECT.equals(legacyType)) return DEVICE_TCP_CONNECT_EVENT;
        if (LEGACY_TYPE_CONNECT_ACK.equals(legacyType)) return DEVICE_TCP_CONNECT_ACK_EVENT;
        if (LEGACY_TYPE_ACK.equals(legacyType)) return DEVICE_TCP_ACK_EVENT;
        if (LEGACY_TYPE_CLOSE.equals(legacyType)) return DEVICE_TCP_CLOSE_EVENT;
        if (LEGACY_TYPE_HEARTBEAT.equals(legacyType)) return DEVICE_TCP_HEARTBEAT_EVENT;
        if (LEGACY_TYPE_ERROR.equals(legacyType)) return DEVICE_TCP_ERROR_EVENT;
        return appEvent == null ? "" : appEvent;
    }

    private boolean isTransportControlEvent(String wireEvent) {
        return DEVICE_TCP_CONNECT_EVENT.equals(wireEvent)
            || DEVICE_TCP_CONNECT_ACK_EVENT.equals(wireEvent)
            || DEVICE_TCP_ACK_EVENT.equals(wireEvent)
            || DEVICE_TCP_CLOSE_EVENT.equals(wireEvent)
            || DEVICE_TCP_HEARTBEAT_EVENT.equals(wireEvent)
            || DEVICE_TCP_ERROR_EVENT.equals(wireEvent);
    }

    private boolean isLanWireEvent(String wireEvent) {
        if (wireEvent == null || wireEvent.isBlank()) {
            return false;
        }
        return DEVICE_DISPLAY_NAME_CHANGED_EVENT.equals(wireEvent)
            || wireEvent.startsWith(DEVICE_PAIRING_EVENT_PREFIX);
    }

    private JSObject buildTransportErrorEventFromWire(JSONObject frame, String fallbackDeviceId) {
        JSONObject payload = frame == null ? null : frame.optJSONObject("payload");
        String message = payload == null ? null : payload.optString("message", null);
        String code = payload == null ? null : payload.optString("code", null);
        JSObject event = new JSObject();
        event.put("deviceId", fallbackDeviceId);
        event.put("message", message == null || message.isBlank() ? "Transport error" : message);
        event.put(
            "code",
            code != null && !code.isBlank() ? code : ERROR_CODE_TRANSPORT_IO_ERROR
        );
        event.put("transport", "tcp");
        return event;
    }

    private JSObject synraLanFrame(
        String legacyType,
        String requestId,
        String appEvent,
        String from,
        String target,
        String replyRequestId,
        Object payload,
        String errorCode
    ) {
        JSObject frame = new JSObject();
        frame.put("event", mapWireEventName(legacyType, appEvent));
        frame.put("requestId", requestId);
        frame.put("timestamp", System.currentTimeMillis());
        if (from != null && !from.isBlank()) {
            frame.put("from", from);
        }
        if (target != null && !target.isBlank()) {
            frame.put("target", target);
        }
        if (replyRequestId != null && !replyRequestId.isBlank()) {
            frame.put("replyRequestId", replyRequestId);
        }
        if (payload != null) {
            frame.put("payload", payload);
        }
        if (errorCode != null && !errorCode.isBlank()) {
            JSObject payloadObj = payload instanceof JSObject ? (JSObject) payload : new JSObject();
            payloadObj.put("code", errorCode);
            payloadObj.put("appId", APP_ID);
            frame.put("payload", payloadObj);
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
        if (length <= 0 || length > MAX_FRAME_BYTES) {
            throw new IOException("Invalid frame length: " + length);
        }
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
                                LEGACY_TYPE_HEARTBEAT,
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
                            event.put("code", ERROR_CODE_HEARTBEAT_SEND_FAILED);
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
