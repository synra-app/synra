package com.synra.plugins.landiscovery;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
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
import java.io.EOFException;
import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

@CapacitorPlugin(name = "LanDiscovery")
public class LanDiscoveryPluginPlugin extends Plugin {
    private static final int DEFAULT_TCP_PORT = 32100;
    private static final int DEFAULT_TIMEOUT_MS = 1500;
    private static final int DEFAULT_DISCOVERY_TIMEOUT_MS = 1500;
    private static final int UDP_DISCOVERY_PORT = 32101;
    private static final String UDP_DISCOVERY_MAGIC = "SYNRA_DISCOVERY_V1";
    private static final String UDP_OFFLINE_TYPE = "offline";
    private static final String DEFAULT_MDNS_SERVICE_TYPE = "_synra._tcp.";
    private static final String APP_ID = "synra";
    private static final String PROTOCOL_VERSION = "1.0";
    private static final String INSTANCE_PREFS_NAME = "synra_preferences_store";
    private static final String INSTANCE_UUID_KEY = "synra.preferences.synra.device.instance-uuid";
    private static final String DEVICE_BASIC_INFO_KEY = "synra.preferences.synra.device.basic-info";
    private static final String LEGACY_DEVICE_DISPLAY_NAME_KEY = "synra.preferences.synra.device.display-name";
    private static final String LEGACY_LAN_PREFS = "synra_lan_discovery";
    private static final String LEGACY_LAN_KEY = "device_uuid";
    private static final String LEGACY_DC_PREFS = "synra_device_connection";
    private static final String LEGACY_DC_KEY = "device_uuid";
    private static final String PAIRED_DEVICES_KEY = "synra.preferences.synra.device.paired-peers";

    private final LanDiscoveryPlugin implementation = new LanDiscoveryPlugin();
    private DatagramSocket udpResponderSocket;
    private final AtomicBoolean udpResponderScheduled = new AtomicBoolean(false);
    private ExecutorService discoveryExecutor;
    private ExecutorService tcpServerExecutor;
    private ExecutorService tcpClientExecutor;
    private ServerSocket tcpServerSocket;
    private volatile boolean tcpServerRunning = false;
    private final Set<Socket> inboundTcpSockets = Collections.synchronizedSet(new HashSet<>());
    private final Map<String, Socket> inboundSessionSockets = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Socket> outboundSessionSockets = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> outboundHostPortToSessionId = new ConcurrentHashMap<>();
    /** Canonical device id for active outbound (host:port) — used when probe skips re-handshake. */
    private final ConcurrentHashMap<String, String> outboundHostPortToCanonDeviceId = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> outboundHostPortToDisplayName = new ConcurrentHashMap<>();
    private NsdManager.RegistrationListener mdnsRegistrationListener;
    private volatile String registeredMdnsServiceName;

    private void notifyTransportError(String code, String message, String transport) {
        JSObject payload = new JSObject();
        payload.put("code", code);
        payload.put("message", message);
        payload.put("transport", transport);
        notifyListeners("transportError", payload);
    }

    private JSONArray readStoredPairedPeerDeviceIds() {
        JSONArray out = new JSONArray();
        Context ctx = getContext();
        if (ctx == null) {
            return out;
        }
        SharedPreferences p = ctx.getSharedPreferences(INSTANCE_PREFS_NAME, Context.MODE_PRIVATE);
        String raw = p.getString(PAIRED_DEVICES_KEY, null);
        if (raw == null || raw.isBlank()) {
            return out;
        }
        try {
            JSONObject root = new JSONObject(raw);
            JSONArray items = root.optJSONArray("items");
            if (items == null) {
                return out;
            }
            for (int i = 0; i < items.length(); i++) {
                JSONObject row = items.optJSONObject(i);
                if (row == null) {
                    continue;
                }
                String id = row.optString("deviceId", null);
                if (id != null && !id.isBlank()) {
                    out.put(id.trim());
                }
            }
        } catch (JSONException ignored) {
        }
        return out;
    }

    @Override
    public void load() {
        super.load();
        this.discoveryExecutor = Executors.newSingleThreadExecutor();
        this.tcpServerExecutor = Executors.newSingleThreadExecutor();
        this.tcpClientExecutor = Executors.newCachedThreadPool();
        ensureDiscoveryTransportsStarted("plugin-load");
    }

    @PluginMethod
    public void startDiscovery(PluginCall call) {
        ensureDiscoveryTransportsStarted("startDiscovery");

        boolean includeLoopback = call.getBoolean("includeLoopback", false);
        boolean enableProbeFallback = call.getBoolean("enableProbeFallback", true);
        String discoveryMode = call.getString("discoveryMode", "hybrid");
        boolean reset = call.getBoolean("reset", true);
        if (reset) {
            closeAllOutboundSessions();
        }
        Integer scanWindowMs = call.getInt("scanWindowMs", null);
        int port = call.getInt("port", DEFAULT_TCP_PORT);
        int timeoutMs = call.getInt("timeoutMs", DEFAULT_TIMEOUT_MS);
        int discoveryTimeoutMs = call.getInt("discoveryTimeoutMs", DEFAULT_DISCOVERY_TIMEOUT_MS);
        String mdnsServiceType = call.getString("mdnsServiceType", DEFAULT_MDNS_SERVICE_TYPE);
        Integer maxProbeHosts = call.getInt("maxProbeHosts", null);
        List<String> manualTargets = toStringList(call.getArray("manualTargets", new JSArray()));
        List<String> subnetCidrs = toStringList(call.getArray("subnetCidrs", new JSArray()));
        WifiManager.MulticastLock discoveryMulticastLock = acquireDiscoveryMulticastLock();
        List<String> combinedTargets;
        try {
            List<String> discoveryTargets = collectAutoDiscoveryTargets(
                discoveryMode,
                mdnsServiceType,
                discoveryTimeoutMs
            );
            Set<String> localAddresses = collectLocalIpv4Addresses(includeLoopback);
            combinedTargets = new ArrayList<>(manualTargets);
            for (String target : discoveryTargets) {
                if (localAddresses.contains(target)) {
                    continue;
                }
                if (!combinedTargets.contains(target)) {
                    combinedTargets.add(target);
                }
            }
        } finally {
            releaseDiscoveryMulticastLock(discoveryMulticastLock);
        }

        JSObject result = implementation.startDiscovery(
            includeLoopback,
            combinedTargets,
            enableProbeFallback,
            discoveryMode,
            subnetCidrs,
            maxProbeHosts,
            reset,
            scanWindowMs
        );

        Set<String> localAddresses = collectLocalIpv4Addresses(includeLoopback);
        List<String> toProbe = new ArrayList<>();
        for (String target : combinedTargets) {
            if (target == null) {
                continue;
            }
            String trimmed = target.trim();
            if (trimmed.isEmpty() || localAddresses.contains(trimmed)) {
                continue;
            }
            if (!toProbe.contains(trimmed)) {
                toProbe.add(trimmed);
            }
        }
        if (maxProbeHosts != null && maxProbeHosts > 0 && toProbe.size() > maxProbeHosts) {
            toProbe = new ArrayList<>(toProbe.subList(0, maxProbeHosts));
        }
        long now = System.currentTimeMillis();
        List<DeviceRecord> probed = new ArrayList<>();
        for (String host : toProbe) {
            ProbeOutcome outcome = probeDevice(host, port, timeoutMs);
            if (!outcome.connectable) {
                continue;
            }
            if (outcome.remoteDeviceId == null || outcome.remoteDeviceId.isBlank()) {
                continue;
            }
            String idTrim = outcome.remoteDeviceId.trim();
            String displayTrim =
                outcome.remoteDisplayName != null && !outcome.remoteDisplayName.isBlank()
                    ? outcome.remoteDisplayName.trim()
                    : idTrim;
            probed.add(LanDiscoveryPlugin.createProbedSynraDevice(idTrim, displayTrim, host, now, now));
        }
        implementation.mergeDevices(probed);
        result = implementation.listDevices();
        result.put("requestId", UUID.randomUUID().toString());

        JSObject scanStateEvent = new JSObject();
        scanStateEvent.put("state", result.optString("state"));
        notifyListeners("scanStateChanged", scanStateEvent);

        call.resolve(result);
    }

    private void ensureDiscoveryTransportsStarted(String reason) {
        startUdpDiscoveryResponder();
        registerMdnsService();
        startTcpServer();
    }

    @PluginMethod
    public void ensureOutboundSession(PluginCall call) {
        String host = call.getString("host");
        if (host == null || host.isBlank()) {
            call.reject("host is required.");
            return;
        }
        int port = call.getInt("port", DEFAULT_TCP_PORT);
        int timeoutMs = call.getInt("timeoutMs", DEFAULT_TIMEOUT_MS);
        ProbeOutcome outcome = probeDevice(host.trim(), port, timeoutMs);
        if (!outcome.connectable) {
            JSObject err = new JSObject();
            err.put("error", "ENSURE_FAILED");
            err.put("host", host.trim());
            err.put("port", port);
            call.resolve(err);
            return;
        }
        String hpKey = host.trim() + ":" + port;
        String sid = outboundHostPortToSessionId.get(hpKey);
        if (sid == null || outboundSessionSockets.get(sid) == null) {
            JSObject err = new JSObject();
            err.put("error", "ENSURE_FAILED");
            call.resolve(err);
            return;
        }
        JSObject ok = new JSObject();
        ok.put("sessionId", sid);
        ok.put("state", "open");
        ok.put("transport", "tcp");
        call.resolve(ok);
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

        Socket socket = outboundSessionSockets.get(sessionId);
        if (socket == null || socket.isClosed()) {
            socket = inboundSessionSockets.get(sessionId);
        }
        if (socket == null || socket.isClosed()) {
            call.reject("Session is not open.");
            return;
        }

        ioExecutor().submit(() -> {
            try {
                JSObject envelope = new JSObject();
                envelope.put("messageType", messageType);
                envelope.put("payload", payload);
                writeSocketFrame(socket, frame("message", sessionId, messageId, envelope));
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("sessionId", sessionId);
                result.put("messageId", messageId);
                result.put("transport", "tcp");
                call.resolve(result);
            } catch (Exception error) {
                notifyTransportError(
                    "TRANSPORT_IO_ERROR",
                    "sendMessage failed: " + error.getMessage(),
                    "tcp"
                );
                call.reject("sendMessage failed: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void closeSession(PluginCall call) {
        String sessionId = call.getString("sessionId");
        if (sessionId == null) {
            call.reject("sessionId is required.");
            return;
        }
        Socket socket = outboundSessionSockets.remove(sessionId);
        if (socket != null) {
            String hpRemove = null;
            for (Map.Entry<String, String> e : outboundHostPortToSessionId.entrySet()) {
                if (sessionId.equals(e.getValue())) {
                    hpRemove = e.getKey();
                    break;
                }
            }
            if (hpRemove != null) {
                outboundHostPortToSessionId.remove(hpRemove);
                outboundHostPortToCanonDeviceId.remove(hpRemove);
                outboundHostPortToDisplayName.remove(hpRemove);
            }
        }
        boolean emittedSessionClosed = false;
        if (socket != null && !socket.isClosed()) {
            try {
                writeSocketFrame(socket, frame("close", sessionId, null, null));
            } catch (Exception ignored) {
                // noop
            }
            closeQuietly(socket);
            JSObject closed = new JSObject();
            closed.put("sessionId", sessionId);
            closed.put("reason", "closed-by-host");
            closed.put("transport", "tcp");
            notifyListeners("sessionClosed", closed);
            emittedSessionClosed = true;
        }
        if (!emittedSessionClosed) {
            socket = inboundSessionSockets.remove(sessionId);
            if (socket != null && !socket.isClosed()) {
                try {
                    writeSocketFrame(socket, frame("close", sessionId, null, null));
                } catch (Exception ignored) {
                }
                closeQuietly(socket);
                inboundTcpSockets.remove(socket);
                JSObject closed = new JSObject();
                closed.put("sessionId", sessionId);
                closed.put("reason", "closed-by-host");
                closed.put("transport", "tcp");
                notifyListeners("sessionClosed", closed);
            }
        }
        JSObject result = new JSObject();
        result.put("success", true);
        result.put("sessionId", sessionId);
        result.put("transport", "tcp");
        call.resolve(result);
    }

    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        broadcastOfflineAnnouncement();
        JSObject result = implementation.stopDiscovery();
        unregisterMdnsService();
        stopUdpDiscoveryResponder();
        stopTcpServer();
        JSObject payload = new JSObject();
        payload.put("state", "idle");
        notifyListeners("scanStateChanged", payload);
        call.resolve(result);
    }

    @PluginMethod
    public void getDiscoveredDevices(PluginCall call) {
        JSObject result = implementation.listDevices();
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        broadcastOfflineAnnouncement();
        unregisterMdnsService();
        stopUdpDiscoveryResponder();
        stopTcpServer();
        if (discoveryExecutor != null) {
            discoveryExecutor.shutdownNow();
        }
        if (tcpServerExecutor != null) {
            tcpServerExecutor.shutdownNow();
        }
        if (tcpClientExecutor != null) {
            tcpClientExecutor.shutdownNow();
        }
    }

    @NonNull
    private static List<String> toStringList(JSArray values) {
        List<String> result = new ArrayList<>();
        for (int i = 0; i < values.length(); i += 1) {
            result.add(values.optString(i));
        }
        return result;
    }

    private List<String> collectAutoDiscoveryTargets(
        String discoveryMode,
        String mdnsServiceType,
        int timeoutMs
    ) {
        String mode = discoveryMode == null ? "hybrid" : discoveryMode;
        boolean shouldRunMdns = "hybrid".equals(mode) || "mdns".equals(mode);
        boolean shouldRunUdpFallback = "hybrid".equals(mode);
        Set<String> discovered = new LinkedHashSet<>();
        if (shouldRunMdns) {
            List<String> mdnsTargets = discoverByMdns(mdnsServiceType, timeoutMs);
            discovered.addAll(mdnsTargets);
        }
        if (shouldRunUdpFallback && discovered.isEmpty()) {
            List<String> udpTargets = discoverByUdp(timeoutMs);
            discovered.addAll(udpTargets);
        }
        return new ArrayList<>(discovered);
    }

    @SuppressLint("MissingPermission")
    private List<String> discoverByMdns(String serviceType, int timeoutMs) {
        Context context = getContext();
        if (context == null) {
            return List.of();
        }
        Object service = context.getSystemService(Context.NSD_SERVICE);
        if (!(service instanceof NsdManager nsdManager)) {
            return List.of();
        }
        String resolvedType = normalizeMdnsType(serviceType);
        Set<String> discovered = new LinkedHashSet<>();
        CountDownLatch latch = new CountDownLatch(1);
        AtomicInteger pendingResolves = new AtomicInteger(0);
        AtomicLong lastResolveAt = new AtomicLong(System.currentTimeMillis());
        NsdManager.DiscoveryListener listener = new NsdManager.DiscoveryListener() {
            @Override
            public void onStartDiscoveryFailed(String serviceType, int errorCode) {
                latch.countDown();
            }

            @Override
            public void onStopDiscoveryFailed(String serviceType, int errorCode) {
                latch.countDown();
            }

            @Override
            public void onDiscoveryStarted(String serviceType) {
            }

            @Override
            public void onDiscoveryStopped(String serviceType) {
                latch.countDown();
            }

            @Override
            public void onServiceFound(NsdServiceInfo serviceInfo) {
                if (registeredMdnsServiceName != null
                    && registeredMdnsServiceName.equals(serviceInfo.getServiceName())) {
                    return;
                }
                pendingResolves.incrementAndGet();
                nsdManager.resolveService(serviceInfo, new NsdManager.ResolveListener() {
                    @Override
                    public void onResolveFailed(NsdServiceInfo serviceInfo, int errorCode) {
                        pendingResolves.decrementAndGet();
                        lastResolveAt.set(System.currentTimeMillis());
                    }

                    @Override
                    public void onServiceResolved(NsdServiceInfo serviceInfo) {
                        try {
                            InetAddress host = serviceInfo.getHost();
                            if (host == null) {
                                return;
                            }
                            String address = host.getHostAddress();
                            if (address != null && !address.isBlank() && !address.contains(":")) {
                                synchronized (discovered) {
                                    discovered.add(address);
                                }
                            }
                        } finally {
                            pendingResolves.decrementAndGet();
                            lastResolveAt.set(System.currentTimeMillis());
                        }
                    }
                });
            }

            @Override
            public void onServiceLost(NsdServiceInfo serviceInfo) {
                // noop
            }
        };
        try {
            nsdManager.discoverServices(resolvedType, NsdManager.PROTOCOL_DNS_SD, listener);
            latch.await(Math.max(timeoutMs, 200), TimeUnit.MILLISECONDS);
            long resolveGraceMs = Math.max(500L, Math.min(2500L, timeoutMs + 500L));
            long settleDeadline = System.currentTimeMillis() + resolveGraceMs;
            while (System.currentTimeMillis() < settleDeadline) {
                if (pendingResolves.get() <= 0) {
                    break;
                }
                if (System.currentTimeMillis() - lastResolveAt.get() > 350L) {
                    break;
                }
                Thread.sleep(50L);
            }
        } catch (Exception ignored) {
        } finally {
            try {
                nsdManager.stopServiceDiscovery(listener);
            } catch (Exception ignored) {
            }
        }
        synchronized (discovered) {
            return new ArrayList<>(discovered);
        }
    }

    private String normalizeMdnsType(String serviceType) {
        String type = serviceType == null || serviceType.isBlank() ? DEFAULT_MDNS_SERVICE_TYPE : serviceType;
        return type.endsWith(".") ? type : type + ".";
    }

    private Set<String> collectLocalIpv4Addresses(boolean includeLoopback) {
        Set<String> result = new HashSet<>();
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            if (interfaces == null) {
                return result;
            }
            for (NetworkInterface networkInterface : java.util.Collections.list(interfaces)) {
                Enumeration<InetAddress> addresses = networkInterface.getInetAddresses();
                for (InetAddress address : java.util.Collections.list(addresses)) {
                    if (address == null) {
                        continue;
                    }
                    if (address.isLoopbackAddress() && !includeLoopback) {
                        continue;
                    }
                    String hostAddress = address.getHostAddress();
                    if (hostAddress == null || hostAddress.isBlank() || hostAddress.contains(":")) {
                        continue;
                    }
                    result.add(hostAddress);
                }
            }
        } catch (Exception ignored) {
            // noop
        }
        return result;
    }

    private List<String> discoverByUdp(int timeoutMs) {
        Set<String> discovered = new LinkedHashSet<>();
        try (DatagramSocket socket = new DatagramSocket()) {
            socket.setBroadcast(true);
            socket.setSoTimeout(200);
            byte[] request = UDP_DISCOVERY_MAGIC.getBytes(StandardCharsets.UTF_8);
            List<InetAddress> destinations = collectUdpBroadcastDestinations();
            for (InetAddress destination : destinations) {
                DatagramPacket packet = new DatagramPacket(
                    request,
                    request.length,
                    destination,
                    UDP_DISCOVERY_PORT
                );
                socket.send(packet);
            }

            long deadline = System.currentTimeMillis() + Math.max(timeoutMs, 200);
            byte[] buffer = new byte[512];
            while (System.currentTimeMillis() < deadline) {
                DatagramPacket response = new DatagramPacket(buffer, buffer.length);
                try {
                    socket.receive(response);
                    String payloadRaw = new String(response.getData(), 0, response.getLength(), StandardCharsets.UTF_8);
                    JSONObject payload = new JSONObject(payloadRaw);
                    if (!APP_ID.equals(payload.optString("appId"))) {
                        continue;
                    }
                    String address = response.getAddress().getHostAddress();
                    if (address != null && !address.isBlank() && !address.contains(":")) {
                        discovered.add(address);
                    }
                } catch (Exception ignored) {
                    // timeout or malformed payload
                }
            }
        } catch (Exception ignored) {
        }
        return new ArrayList<>(discovered);
    }

    private List<InetAddress> collectUdpBroadcastDestinations() {
        LinkedHashSet<InetAddress> destinations = new LinkedHashSet<>();
        try {
            destinations.add(InetAddress.getByName("255.255.255.255"));
        } catch (Exception ignored) {
            // noop
        }
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            if (interfaces == null) {
                return new ArrayList<>(destinations);
            }
            for (NetworkInterface networkInterface : Collections.list(interfaces)) {
                try {
                    if (!networkInterface.isUp() || networkInterface.isLoopback()) {
                        continue;
                    }
                } catch (Exception ignored) {
                    continue;
                }
                for (InterfaceAddress interfaceAddress : networkInterface.getInterfaceAddresses()) {
                    if (interfaceAddress == null) {
                        continue;
                    }
                    InetAddress broadcast = interfaceAddress.getBroadcast();
                    if (!(broadcast instanceof Inet4Address)) {
                        continue;
                    }
                    String hostAddress = broadcast.getHostAddress();
                    if (hostAddress == null || hostAddress.isBlank() || hostAddress.startsWith("127.")) {
                        continue;
                    }
                    destinations.add(broadcast);
                }
            }
        } catch (Exception ignored) {
            // noop
        }
        return new ArrayList<>(destinations);
    }

    private void startUdpDiscoveryResponder() {
        if (!udpResponderScheduled.compareAndSet(false, true)) {
            return;
        }
        ExecutorService responderExecutor = discoveryExecutor;
        if (responderExecutor == null) {
            responderExecutor = Executors.newSingleThreadExecutor();
            discoveryExecutor = responderExecutor;
        }
        responderExecutor.submit(() -> {
            try {
                DatagramSocket socket = new DatagramSocket(UDP_DISCOVERY_PORT);
                socket.setBroadcast(true);
                this.udpResponderSocket = socket;
                byte[] buffer = new byte[256];
                while (!socket.isClosed()) {
                    DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                    socket.receive(packet);
                    String payload = new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8).trim();
                    if (payload.startsWith(UDP_DISCOVERY_MAGIC + " ")) {
                        String metadataRaw = payload.substring((UDP_DISCOVERY_MAGIC + " ").length()).trim();
                        handleUdpAnnouncement(metadataRaw);
                        continue;
                    }
                    if (!UDP_DISCOVERY_MAGIC.equals(payload)) {
                        continue;
                    }
                    JSONObject response = new JSONObject();
                    response.put("appId", APP_ID);
                    response.put("protocolVersion", PROTOCOL_VERSION);
                    response.put("port", DEFAULT_TCP_PORT);
                    response.put("sourceDeviceId", getOrCreateLocalDeviceUuid());
                    response.put("displayName", localSynraDisplayName());
                    byte[] responseBytes = response.toString().getBytes(StandardCharsets.UTF_8);
                    DatagramPacket responsePacket = new DatagramPacket(
                        responseBytes,
                        responseBytes.length,
                        packet.getAddress(),
                        packet.getPort()
                    );
                    socket.send(responsePacket);
                }
            } catch (Exception ignored) {
                udpResponderScheduled.set(false);
            }
        });
    }

    private void stopUdpDiscoveryResponder() {
        if (udpResponderSocket != null && !udpResponderSocket.isClosed()) {
            udpResponderSocket.close();
        }
        udpResponderSocket = null;
        udpResponderScheduled.set(false);
    }

    private void handleUdpAnnouncement(String metadataRaw) {
        try {
            JSONObject metadata = new JSONObject(metadataRaw);
            String type = metadata.optString("type", "");
            if (!UDP_OFFLINE_TYPE.equals(type)) {
                return;
            }
            String sourceDeviceId = metadata.optString("sourceDeviceId", null);
            if (sourceDeviceId == null || sourceDeviceId.isBlank()) {
                return;
            }
            String sourceHostIp = metadata.optString("sourceHostIp", null);
            String localDeviceId = getOrCreateLocalDeviceUuid();
            if (sourceDeviceId.equals(localDeviceId)) {
                return;
            }
            String offlineDeviceId = LanDiscoveryIdUtils.canonicalLanDeviceId(sourceDeviceId);
            JSObject payload = new JSObject();
            payload.put("deviceId", offlineDeviceId);
            if (sourceHostIp != null && !sourceHostIp.isBlank() && LanDiscoveryIdUtils.isIpv4Address(sourceHostIp)) {
                payload.put("ipAddress", sourceHostIp);
            }
            notifyListeners("deviceLost", payload);
        } catch (Exception ignored) {
            // noop
        }
    }

    private void broadcastOfflineAnnouncement() {
        try (DatagramSocket socket = new DatagramSocket()) {
            socket.setBroadcast(true);
            String sourceHostIp = primarySourceHostIp();
            List<InetAddress> destinations = collectUdpBroadcastDestinations();
            for (int attempt = 0; attempt < 3; attempt += 1) {
                JSONObject metadata = new JSONObject();
                metadata.put("type", UDP_OFFLINE_TYPE);
                metadata.put("sourceDeviceId", getOrCreateLocalDeviceUuid());
                metadata.put("timestamp", System.currentTimeMillis());
                if (sourceHostIp != null && !sourceHostIp.isBlank()) {
                    metadata.put("sourceHostIp", sourceHostIp);
                }
                byte[] payload =
                    (UDP_DISCOVERY_MAGIC + " " + metadata.toString()).getBytes(StandardCharsets.UTF_8);
                for (InetAddress destination : destinations) {
                    DatagramPacket packet = new DatagramPacket(
                        payload,
                        payload.length,
                        destination,
                        UDP_DISCOVERY_PORT
                    );
                    socket.send(packet);
                }
                if (attempt < 2) {
                    try {
                        Thread.sleep(120L);
                    } catch (InterruptedException ignored) {
                        Thread.currentThread().interrupt();
                    }
                }
            }
        } catch (Exception ignored) {}
    }

    @SuppressLint("MissingPermission")
    private void registerMdnsService() {
        if (mdnsRegistrationListener != null) {
            return;
        }
        Context context = getContext();
        if (context == null) {
            return;
        }
        Object service = context.getSystemService(Context.NSD_SERVICE);
        if (!(service instanceof NsdManager nsdManager)) {
            return;
        }
        NsdServiceInfo info = new NsdServiceInfo();
        info.setServiceName("synra-" + UUID.randomUUID().toString().substring(0, 8));
        info.setServiceType(DEFAULT_MDNS_SERVICE_TYPE);
        info.setPort(DEFAULT_TCP_PORT);
        registeredMdnsServiceName = info.getServiceName();
        this.mdnsRegistrationListener = new NsdManager.RegistrationListener() {
            @Override
            public void onServiceRegistered(NsdServiceInfo NsdServiceInfo) {
                // noop
            }

            @Override
            public void onRegistrationFailed(NsdServiceInfo serviceInfo, int errorCode) {
                // noop
            }

            @Override
            public void onServiceUnregistered(NsdServiceInfo serviceInfo) {
                // noop
            }

            @Override
            public void onUnregistrationFailed(NsdServiceInfo serviceInfo, int errorCode) {
                // noop
            }
        };
        try {
            nsdManager.registerService(info, NsdManager.PROTOCOL_DNS_SD, mdnsRegistrationListener);
        } catch (Exception ignored) {
            this.mdnsRegistrationListener = null;
            registeredMdnsServiceName = null;
        }
    }

    @SuppressLint("MissingPermission")
    private void unregisterMdnsService() {
        Context context = getContext();
        if (context == null || mdnsRegistrationListener == null) {
            return;
        }
        Object service = context.getSystemService(Context.NSD_SERVICE);
        if (!(service instanceof NsdManager nsdManager)) {
            return;
        }
        try {
            nsdManager.unregisterService(mdnsRegistrationListener);
        } catch (Exception ignored) {
        } finally {
            mdnsRegistrationListener = null;
            registeredMdnsServiceName = null;
        }
    }

    private WifiManager.MulticastLock acquireDiscoveryMulticastLock() {
        Context context = getContext();
        if (context == null) {
            return null;
        }
        Object service = context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (!(service instanceof WifiManager wifiManager)) {
            return null;
        }
        try {
            WifiManager.MulticastLock lock = wifiManager.createMulticastLock("synra-lan-discovery");
            lock.setReferenceCounted(false);
            lock.acquire();
            return lock;
        } catch (Exception error) {
            return null;
        }
    }

    private void releaseDiscoveryMulticastLock(WifiManager.MulticastLock lock) {
        if (lock == null) {
            return;
        }
        try {
            if (lock.isHeld()) {
                lock.release();
            }
        } catch (Exception error) {
        }
    }

    private void startTcpServer() {
        ExecutorService serverExecutor = tcpServerExecutor;
        if (serverExecutor == null) {
            return;
        }
        if (tcpServerRunning) {
            return;
        }
        tcpServerRunning = true;
        serverExecutor.submit(() -> {
            try {
                ServerSocket serverSocket = new ServerSocket();
                serverSocket.setReuseAddress(true);
                serverSocket.bind(new InetSocketAddress("0.0.0.0", DEFAULT_TCP_PORT));
                serverSocket.setSoTimeout(1000);
                tcpServerSocket = serverSocket;
                while (tcpServerRunning && !serverSocket.isClosed()) {
                    try {
                        Socket socket = serverSocket.accept();
                        inboundTcpSockets.add(socket);
                        handleInboundTcpSocket(socket);
                    } catch (SocketTimeoutException ignored) {
                        // continue accepting
                    } catch (IOException error) {
                        if (!tcpServerRunning) {
                            break;
                        }
                        notifyTransportError(
                            "TCP_ACCEPT_ERROR",
                            "TCP accept failed: " + error.getMessage(),
                            "tcp"
                        );
                    }
                }
            } catch (IOException error) {
                notifyTransportError(
                    "TCP_SERVER_START_FAILED",
                    "TCP server failed to start: " + error.getMessage(),
                    "tcp"
                );
            } finally {
                tcpServerRunning = false;
                ServerSocket current = tcpServerSocket;
                tcpServerSocket = null;
                if (current != null) {
                    try {
                        current.close();
                    } catch (IOException ignored) {
                        // noop
                    }
                }
            }
        });
    }

    private void stopTcpServer() {
        tcpServerRunning = false;
        ServerSocket current = tcpServerSocket;
        if (current != null) {
            try {
                current.close();
            } catch (IOException ignored) {
                // noop
            }
        }
        synchronized (inboundTcpSockets) {
            for (Socket socket : inboundTcpSockets) {
                closeQuietly(socket);
            }
            inboundTcpSockets.clear();
        }
        inboundSessionSockets.clear();
        closeAllOutboundSessions();
    }

    private void closeAllOutboundSessions() {
        for (String sid : new ArrayList<>(outboundSessionSockets.keySet())) {
            Socket s = outboundSessionSockets.remove(sid);
            if (s != null && !s.isClosed()) {
                closeQuietly(s);
            }
            JSObject closed = new JSObject();
            closed.put("sessionId", sid);
            closed.put("reason", "host-stopped");
            closed.put("transport", "tcp");
            notifyListeners("sessionClosed", closed);
        }
        outboundHostPortToSessionId.clear();
        outboundHostPortToCanonDeviceId.clear();
        outboundHostPortToDisplayName.clear();
    }

    private void handleInboundTcpSocket(Socket socket) {
        ExecutorService clientExecutor = tcpClientExecutor;
        if (clientExecutor == null) {
            closeQuietly(socket);
            return;
        }
        clientExecutor.submit(() -> {
            String activeSessionId = null;
            boolean sessionClosedNotified = false;
            try {
                socket.setSoTimeout(DEFAULT_TIMEOUT_MS);
                DataInputStream input = new DataInputStream(new BufferedInputStream(socket.getInputStream()));
                DataOutputStream output = new DataOutputStream(new BufferedOutputStream(socket.getOutputStream()));
                while (!socket.isClosed()) {
                    JSONObject request;
                    try {
                        request = readFrame(input);
                    } catch (SocketTimeoutException ignored) {
                        continue;
                    }
                    String type = request.optString("type");
                    String sessionId = request.optString("sessionId", UUID.randomUUID().toString());
                    if ("hello".equals(type)) {
                        JSONObject helloPayload = request.optJSONObject("payload");
                        String sourceDeviceId =
                            helloPayload == null ? null : helloPayload.optString("sourceDeviceId", null);
                        String sourceHostIp =
                            helloPayload == null ? null : helloPayload.optString("sourceHostIp", null);
                        String peerDisplay =
                            helloPayload == null ? null : helloPayload.optString("displayName", null);
                        String handshakeKind =
                            helloPayload == null ? null : helloPayload.optString("handshakeKind", null);
                        Boolean claimsPeerPaired =
                            helloPayload == null || !helloPayload.has("claimsPeerPaired")
                                ? null
                                : helloPayload.optBoolean("claimsPeerPaired", false);
                        JSONArray remotePairedPeerDeviceIds = new JSONArray();
                        if (helloPayload != null) {
                            JSONArray inboundPairedPeerIds = helloPayload.optJSONArray("pairedPeerDeviceIds");
                            if (inboundPairedPeerIds != null) {
                                for (int i = 0; i < inboundPairedPeerIds.length(); i++) {
                                    String id = inboundPairedPeerIds.optString(i, "").trim();
                                    if (!id.isEmpty()) {
                                        remotePairedPeerDeviceIds.put(id);
                                    }
                                }
                            }
                        }
                        if (peerDisplay != null) {
                            peerDisplay = peerDisplay.trim();
                            if (peerDisplay.isEmpty()) {
                                peerDisplay = null;
                            }
                        }
                        if (sourceDeviceId == null || sourceDeviceId.isBlank()) {
                            writeFrame(output, frame("error", sessionId, null, "SOURCE_DEVICE_ID_REQUIRED"));
                            sessionClosedNotified = true;
                            break;
                        }
                        JSObject discoveredPeerDevice = buildDiscoveredPeerDevicePayload(
                            sourceDeviceId,
                            peerDisplay,
                            sourceHostIp,
                            socket
                        );
                        if (discoveredPeerDevice != null) {
                            JSObject payload = new JSObject();
                            payload.put("device", discoveredPeerDevice);
                            notifyListeners("deviceFound", payload);
                            notifyListeners("deviceUpdated", payload);
                            notifyListeners("deviceConnectableUpdated", payload);
                        }
                        JSObject helloAckPayload = new JSObject();
                        helloAckPayload.put("sourceDeviceId", getOrCreateLocalDeviceUuid());
                        helloAckPayload.put("displayName", localSynraDisplayName());
                        helloAckPayload.put("pairedPeerDeviceIds", readStoredPairedPeerDeviceIds());
                        String selfIp = primarySourceHostIp();
                        if (selfIp != null && !selfIp.isBlank()) {
                            helloAckPayload.put("sourceHostIp", selfIp);
                        }
                        InetAddress peerAddr = socket.getInetAddress();
                        if (peerAddr != null) {
                            String observed = peerAddr.getHostAddress();
                            if (observed != null && !observed.isBlank()) {
                                helloAckPayload.put("observedPeerIp", observed);
                            }
                        }
                        writeFrame(output, frame("helloAck", sessionId, null, helloAckPayload));
                        try {
                            output.flush();
                        } catch (IOException ignored) {
                            // ignore flush errors on close path
                        }
                        activeSessionId = sessionId;
                        inboundSessionSockets.put(sessionId, socket);
                        JSObject opened = new JSObject();
                        opened.put("sessionId", sessionId);
                        opened.put("transport", "tcp");
                        opened.put("deviceId", LanDiscoveryIdUtils.canonicalLanDeviceId(sourceDeviceId));
                        opened.put("direction", "inbound");
                        opened.put("host", socket.getInetAddress().getHostAddress());
                        opened.put("port", DEFAULT_TCP_PORT);
                        if (peerDisplay != null) {
                            opened.put("displayName", peerDisplay);
                        }
                        opened.put("pairedPeerDeviceIds", remotePairedPeerDeviceIds);
                        if ("paired".equals(handshakeKind) || "fresh".equals(handshakeKind)) {
                            opened.put("handshakeKind", handshakeKind);
                        }
                        if (claimsPeerPaired != null) {
                            opened.put("claimsPeerPaired", claimsPeerPaired);
                        }
                        notifyListeners("sessionOpened", opened);
                        continue;
                    }
                    if ("message".equals(type)) {
                        if (activeSessionId == null || !activeSessionId.equals(sessionId)) {
                            writeFrame(output, frame("error", sessionId, null, "SESSION_NOT_ESTABLISHED"));
                            continue;
                        }
                        String messageId = request.optString("messageId", null);
                        Object rawPayload = request.opt("payload");
                        JSONObject envelope = rawPayload instanceof JSONObject ? (JSONObject) rawPayload : null;
                        JSObject received = new JSObject();
                        received.put("sessionId", sessionId);
                        received.put("messageId", messageId);
                        received.put(
                            "messageType",
                            envelope == null ? "transport.message.received" : envelope.optString("messageType", "transport.message.received")
                        );
                        received.put("payload", envelope == null ? null : envelope.opt("payload"));
                        received.put("timestamp", request.optLong("timestamp", System.currentTimeMillis()));
                        received.put("transport", "tcp");
                        notifyListeners("messageReceived", received);
                        if (messageId != null && !messageId.isBlank()) {
                            writeFrame(output, frame("ack", sessionId, messageId, null));
                        }
                        continue;
                    }
                    if ("heartbeat".equals(type)) {
                        if (activeSessionId == null || !activeSessionId.equals(sessionId)) {
                            continue;
                        }
                        writeFrame(output, frame("heartbeat", activeSessionId, null, null));
                        continue;
                    }
                    if ("close".equals(type)) {
                        if (activeSessionId == null || !activeSessionId.equals(sessionId)) {
                            break;
                        }
                        inboundSessionSockets.remove(activeSessionId);
                        JSObject closed = new JSObject();
                        closed.put("sessionId", activeSessionId);
                        closed.put("reason", "peer-closed");
                        closed.put("transport", "tcp");
                        notifyListeners("sessionClosed", closed);
                        sessionClosedNotified = true;
                        break;
                    }
                }
            } catch (EOFException ignored) {
                // Peer closed the socket gracefully.
            } catch (SocketException error) {
                if (!socket.isClosed()) {
                    notifyTransportError(
                        "TRANSPORT_IO_ERROR",
                        "Inbound socket failed: " + error.getMessage(),
                        "tcp"
                    );
                }
            } catch (IOException error) {
                notifyTransportError(
                    "TRANSPORT_IO_ERROR",
                    "Inbound socket failed: " + error.getMessage(),
                    "tcp"
                );
            } finally {
                if (activeSessionId != null) {
                    inboundSessionSockets.remove(activeSessionId);
                }
                if (!sessionClosedNotified && activeSessionId != null) {
                    JSObject closed = new JSObject();
                    closed.put("sessionId", activeSessionId);
                    closed.put("reason", "socket-closed");
                    closed.put("transport", "tcp");
                    notifyListeners("sessionClosed", closed);
                }
                inboundTcpSockets.remove(socket);
                closeQuietly(socket);
            }
        });
    }

    private ExecutorService ioExecutor() {
        if (tcpClientExecutor == null) {
            tcpClientExecutor = Executors.newCachedThreadPool();
        }
        return tcpClientExecutor;
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

    private JSObject buildDiscoveredPeerDevicePayload(
        String sourceDeviceId,
        String displayName,
        String sourceHostIp,
        Socket socket
    ) {
        String normalizedDeviceId = LanDiscoveryIdUtils.canonicalLanDeviceId(sourceDeviceId);
        String host = LanDiscoveryIdUtils.normalizePeerHost(sourceHostIp, socket);
        if (host == null || host.isBlank()) {
            return null;
        }
        String normalizedName = displayName;
        if (normalizedName != null) {
            normalizedName = normalizedName.trim();
        }
        if (normalizedName == null || normalizedName.isBlank()) {
            return null;
        }
        long now = System.currentTimeMillis();
        JSObject device = new JSObject();
        device.put("deviceId", normalizedDeviceId);
        device.put("name", normalizedName);
        device.put("ipAddress", host);
        device.put("port", DEFAULT_TCP_PORT);
        device.put("source", "session");
        device.put("connectable", true);
        device.put("connectCheckAt", now);
        device.put("discoveredAt", now);
        device.put("lastSeenAt", now);
        return device;
    }

    private String primarySourceHostIp() {
        try {
            List<String> candidates = new ArrayList<>();
            Enumeration<NetworkInterface> nis = NetworkInterface.getNetworkInterfaces();
            while (nis.hasMoreElements()) {
                NetworkInterface ni = nis.nextElement();
                if (!ni.isUp() || ni.isLoopback()) {
                    continue;
                }
                Enumeration<InetAddress> addrs = ni.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    InetAddress a = addrs.nextElement();
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) {
                        String ip = a.getHostAddress();
                        if (ip != null && !ip.isBlank() && !ip.startsWith("169.254.")) {
                            candidates.add(ip);
                        }
                    }
                }
            }
            Collections.sort(candidates);
            return candidates.isEmpty() ? null : candidates.get(0);
        } catch (Exception e) {
            return null;
        }
    }

    private ProbeOutcome probeDevice(String host, int port, int timeoutMs) {
        String hpKey = host.trim() + ":" + port;
        String existingSid = outboundHostPortToSessionId.get(hpKey);
        if (existingSid != null) {
            Socket existing = outboundSessionSockets.get(existingSid);
            if (existing != null && !existing.isClosed()) {
                String cachedCanon = outboundHostPortToCanonDeviceId.get(hpKey);
                String cachedDisp = outboundHostPortToDisplayName.get(hpKey);
                if (cachedCanon != null && !cachedCanon.isBlank()) {
                    return new ProbeOutcome(true, null, cachedCanon, cachedDisp);
                }
                JSObject listed = implementation.listDevices();
                JSONArray arr = listed.optJSONArray("devices");
                if (arr != null) {
                    for (int i = 0; i < arr.length(); i++) {
                        JSONObject d = arr.optJSONObject(i);
                        if (d != null && host.equals(d.optString("ipAddress")) && d.optBoolean("connectable", false)) {
                            return new ProbeOutcome(
                                true,
                                null,
                                LanDiscoveryIdUtils.canonicalLanDeviceId(d.optString("deviceId")),
                                d.optString("name", null)
                            );
                        }
                    }
                }
                return new ProbeOutcome(true, null, null, null);
            }
            outboundHostPortToSessionId.remove(hpKey);
            outboundHostPortToCanonDeviceId.remove(hpKey);
            outboundHostPortToDisplayName.remove(hpKey);
        }

        Socket socket = new Socket();
        try {
            socket.connect(new InetSocketAddress(host, port), timeoutMs);
            socket.setSoTimeout(timeoutMs);
            DataInputStream input = new DataInputStream(new BufferedInputStream(socket.getInputStream()));
            DataOutputStream output = new DataOutputStream(new BufferedOutputStream(socket.getOutputStream()));
            String sessionId = UUID.randomUUID().toString();
            JSObject probePayload = new JSObject();
            probePayload.put("sourceDeviceId", getOrCreateLocalDeviceUuid());
            probePayload.put("probe", true);
            probePayload.put("displayName", localSynraDisplayName());
            String probeSelfIp = primarySourceHostIp();
            if (probeSelfIp != null && !probeSelfIp.isBlank()) {
                probePayload.put("sourceHostIp", probeSelfIp);
            }
            writeFrame(output, frame("hello", sessionId, null, probePayload));
            try {
                output.flush();
            } catch (IOException ignored) {
            }
            JSONObject response = readFrame(input);
            if (!"helloAck".equals(response.optString("type"))) {
                closeQuietly(socket);
                return new ProbeOutcome(false, "MISSING_HELLO_ACK", null, null);
            }
            if (!APP_ID.equals(response.optString("appId"))) {
                closeQuietly(socket);
                return new ProbeOutcome(false, "APP_ID_MISMATCH", null, null);
            }
            JSONObject ackPayload = response.optJSONObject("payload");
            String remote =
                ackPayload == null ? null : ackPayload.optString("sourceDeviceId", null);
            String remoteDisplayName =
                ackPayload == null ? null : ackPayload.optString("displayName", null);
            if (remote != null && remote.isBlank()) {
                remote = null;
            }
            if (remoteDisplayName != null) {
                remoteDisplayName = remoteDisplayName.trim();
                if (remoteDisplayName.isEmpty()) {
                    remoteDisplayName = null;
                }
            }
            if (remote == null || remote.isBlank()) {
                closeQuietly(socket);
                return new ProbeOutcome(false, "MISSING_REMOTE_DEVICE_ID", null, null);
            }
            String localUuid = getOrCreateLocalDeviceUuid();
            if (remote.equals(localUuid)) {
                closeQuietly(socket);
                return new ProbeOutcome(false, "SELF_DEVICE", null, remoteDisplayName);
            }
            String oldSid = outboundHostPortToSessionId.put(hpKey, sessionId);
            if (oldSid != null && !oldSid.equals(sessionId)) {
                Socket oldSock = outboundSessionSockets.remove(oldSid);
                closeQuietly(oldSock);
            }
            outboundSessionSockets.put(sessionId, socket);
            socket.setSoTimeout(DEFAULT_TIMEOUT_MS);
            String canon = LanDiscoveryIdUtils.canonicalLanDeviceId(remote);
            outboundHostPortToCanonDeviceId.put(hpKey, canon);
            outboundHostPortToDisplayName.put(
                hpKey,
                remoteDisplayName != null && !remoteDisplayName.isBlank() ? remoteDisplayName : null
            );
            long now = System.currentTimeMillis();
            JSObject opened = new JSObject();
            opened.put("sessionId", sessionId);
            opened.put("transport", "tcp");
            opened.put("deviceId", canon);
            opened.put("direction", "outbound");
            opened.put("host", host);
            opened.put("port", port);
            if (remoteDisplayName != null) {
                opened.put("displayName", remoteDisplayName);
            }
            JSONArray remotePairedPeerDeviceIds = new JSONArray();
            if (ackPayload != null) {
                JSONArray inboundPairedPeerIds = ackPayload.optJSONArray("pairedPeerDeviceIds");
                if (inboundPairedPeerIds != null) {
                    for (int i = 0; i < inboundPairedPeerIds.length(); i++) {
                        String id = inboundPairedPeerIds.optString(i, "").trim();
                        if (!id.isEmpty()) {
                            remotePairedPeerDeviceIds.put(id);
                        }
                    }
                }
                String handshakeKind = ackPayload.optString("handshakeKind", null);
                if ("paired".equals(handshakeKind) || "fresh".equals(handshakeKind)) {
                    opened.put("handshakeKind", handshakeKind);
                }
                if (ackPayload.has("claimsPeerPaired")) {
                    opened.put("claimsPeerPaired", ackPayload.optBoolean("claimsPeerPaired", false));
                }
            }
            opened.put("pairedPeerDeviceIds", remotePairedPeerDeviceIds);
            notifyListeners("sessionOpened", opened);

            JSObject dev = new JSObject();
            dev.put("deviceId", canon);
            dev.put("name", remoteDisplayName != null && !remoteDisplayName.isBlank() ? remoteDisplayName : canon);
            dev.put("ipAddress", host);
            dev.put("port", port);
            dev.put("source", "probe");
            dev.put("connectable", true);
            dev.put("connectCheckAt", now);
            dev.put("discoveredAt", now);
            dev.put("lastSeenAt", now);
            JSObject wrap = new JSObject();
            wrap.put("device", dev);
            notifyListeners("deviceFound", wrap);
            notifyListeners("deviceUpdated", wrap);
            notifyListeners("deviceConnectableUpdated", wrap);

            String recordName =
                remoteDisplayName != null && !remoteDisplayName.isBlank() ? remoteDisplayName.trim() : canon;
            List<DeviceRecord> mergeOne = new ArrayList<>();
            mergeOne.add(LanDiscoveryPlugin.createProbedSynraDevice(canon, recordName, host, now, now));
            implementation.mergeDevices(mergeOne);

            ExecutorService clientExecutor = tcpClientExecutor;
            if (clientExecutor != null) {
                clientExecutor.submit(() -> runOutboundReadLoop(sessionId, socket));
            }
            return new ProbeOutcome(true, null, canon, remoteDisplayName);
        } catch (Exception error) {
            closeQuietly(socket);
            return new ProbeOutcome(false, error.getMessage(), null, null);
        }
    }

    private void runOutboundReadLoop(String sessionId, Socket socket) {
        try {
            DataInputStream input = new DataInputStream(new BufferedInputStream(socket.getInputStream()));
            DataOutputStream output = new DataOutputStream(new BufferedOutputStream(socket.getOutputStream()));
            while (!socket.isClosed()) {
                JSONObject request;
                try {
                    request = readFrame(input);
                } catch (SocketTimeoutException ignored) {
                    continue;
                }
                if (request == null) {
                    break;
                }
                String type = request.optString("type");
                String frameSessionId = request.optString("sessionId", sessionId);
                if ("message".equals(type)) {
                    String messageId = request.optString("messageId", null);
                    Object rawPayload = request.opt("payload");
                    JSONObject envelope = rawPayload instanceof JSONObject ? (JSONObject) rawPayload : null;
                    JSObject received = new JSObject();
                    received.put("sessionId", sessionId);
                    received.put("messageId", messageId);
                    received.put(
                        "messageType",
                        envelope == null ? "transport.message.received" : envelope.optString("messageType", "transport.message.received")
                    );
                    received.put("payload", envelope == null ? null : envelope.opt("payload"));
                    received.put("timestamp", request.optLong("timestamp", System.currentTimeMillis()));
                    received.put("transport", "tcp");
                    notifyListeners("messageReceived", received);
                    if (messageId != null && !messageId.isBlank()) {
                        writeFrame(output, frame("ack", sessionId, messageId, null));
                    }
                } else if ("close".equals(type)) {
                    break;
                }
            }
        } catch (Exception ignored) {
        } finally {
            outboundSessionSockets.remove(sessionId);
            for (Map.Entry<String, String> e : new ArrayList<>(outboundHostPortToSessionId.entrySet())) {
                if (sessionId.equals(e.getValue())) {
                    String hp = e.getKey();
                    outboundHostPortToSessionId.remove(hp);
                    outboundHostPortToCanonDeviceId.remove(hp);
                    outboundHostPortToDisplayName.remove(hp);
                    break;
                }
            }
            closeQuietly(socket);
            JSObject closed = new JSObject();
            closed.put("sessionId", sessionId);
            closed.put("reason", "peer-closed");
            closed.put("transport", "tcp");
            notifyListeners("sessionClosed", closed);
        }
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

    private void writeSocketFrame(Socket socket, JSObject frame) throws IOException {
        synchronized (socket) {
            DataOutputStream output = new DataOutputStream(new BufferedOutputStream(socket.getOutputStream()));
            writeFrame(output, frame);
        }
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

    private static void closeQuietly(Socket socket) {
        try {
            socket.close();
        } catch (IOException ignored) {
            // ignore
        }
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
        android.content.SharedPreferences legacyLan =
            context.getSharedPreferences(LEGACY_LAN_PREFS, Context.MODE_PRIVATE);
        String lan = legacyLan.getString(LEGACY_LAN_KEY, null);
        if (lan != null && !lan.isBlank()) {
            unified.edit().putString(INSTANCE_UUID_KEY, lan).apply();
            legacyLan.edit().remove(LEGACY_LAN_KEY).apply();
            return lan;
        }
        android.content.SharedPreferences legacyDc =
            context.getSharedPreferences(LEGACY_DC_PREFS, Context.MODE_PRIVATE);
        String dc = legacyDc.getString(LEGACY_DC_KEY, null);
        if (dc != null && !dc.isBlank()) {
            unified.edit().putString(INSTANCE_UUID_KEY, dc).apply();
            legacyDc.edit().remove(LEGACY_DC_KEY).apply();
            return dc;
        }
        String created = UUID.randomUUID().toString();
        unified.edit().putString(INSTANCE_UUID_KEY, created).apply();
        return created;
    }

}
