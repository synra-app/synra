package com.synra.plugins.landiscovery;

import android.annotation.SuppressLint;
import android.content.Context;
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
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

@CapacitorPlugin(name = "LanDiscovery")
public class LanDiscoveryPluginPlugin extends Plugin {
    private static final int DEFAULT_TCP_PORT = 32100;
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

    private final LanDiscoveryPlugin implementation = new LanDiscoveryPlugin();
    private DatagramSocket udpResponderSocket;
    private final AtomicBoolean udpResponderScheduled = new AtomicBoolean(false);
    private ExecutorService discoveryExecutor;
    private NsdManager.RegistrationListener mdnsRegistrationListener;
    private volatile String registeredMdnsServiceName;

    @Override
    public void load() {
        super.load();
        this.discoveryExecutor = Executors.newSingleThreadExecutor();
        ensureDiscoveryTransportsStarted();
    }

    @PluginMethod
    public void startDiscovery(PluginCall call) {
        ensureDiscoveryTransportsStarted();

        boolean includeLoopback = call.getBoolean("includeLoopback", false);
        boolean enableProbeFallback = call.getBoolean("enableProbeFallback", true);
        String discoveryMode = call.getString("discoveryMode", "hybrid");
        boolean reset = call.getBoolean("reset", true);
        // Rescan does not stop background transports; the device map is cleared in `implementation.startDiscovery` when reset.
        Integer scanWindowMs = call.getInt("scanWindowMs", null);
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
                discoveryTimeoutMs,
                enableProbeFallback
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

        implementation.startDiscovery(
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
        Set<String> manualSet = new HashSet<>();
        for (String m : manualTargets) {
            if (m != null && !m.isBlank()) {
                manualSet.add(m.trim());
            }
        }
        implementation.mergeCandidateDevices(toProbe, manualSet);
        JSObject result = implementation.listDevices();
        result.put("requestId", UUID.randomUUID().toString());

        JSObject scanStateEvent = new JSObject();
        scanStateEvent.put("state", result.optString("state"));
        notifyListeners("scanStateChanged", scanStateEvent);

        call.resolve(result);
    }

    private void ensureDiscoveryTransportsStarted() {
        startUdpDiscoveryResponder();
        registerMdnsService();
    }

    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        broadcastOfflineAnnouncement();
        JSObject result = implementation.stopDiscovery();
        unregisterMdnsService();
        stopUdpDiscoveryResponder();
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
        if (discoveryExecutor != null) {
            discoveryExecutor.shutdownNow();
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
        int timeoutMs,
        boolean enableProbeFallback
    ) {
        String mode = discoveryMode == null ? "hybrid" : discoveryMode;
        boolean shouldRunMdns = "hybrid".equals(mode) || "mdns".equals(mode);
        boolean isHybrid = "hybrid".equals(mode);
        Set<String> discovered = new LinkedHashSet<>();
        if (shouldRunMdns) {
            discovered.addAll(discoverByMdns(mdnsServiceType, timeoutMs));
        }
        if (isHybrid && enableProbeFallback) {
            discovered.addAll(discoverByUdp(timeoutMs));
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
