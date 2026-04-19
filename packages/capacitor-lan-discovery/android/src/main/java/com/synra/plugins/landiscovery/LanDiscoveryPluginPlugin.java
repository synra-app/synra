package com.synra.plugins.landiscovery;

import android.annotation.SuppressLint;
import android.content.Context;
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
import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "LanDiscovery")
public class LanDiscoveryPluginPlugin extends Plugin {
    private static final int DEFAULT_TCP_PORT = 32100;
    private static final int DEFAULT_TIMEOUT_MS = 1500;
    private static final int DEFAULT_DISCOVERY_TIMEOUT_MS = 1500;
    private static final int UDP_DISCOVERY_PORT = 32101;
    private static final String UDP_DISCOVERY_MAGIC = "SYNRA_DISCOVERY_V1";
    private static final String DEFAULT_MDNS_SERVICE_TYPE = "_synra._tcp.";
    private static final String APP_ID = "synra";
    private static final String PROTOCOL_VERSION = "1.0";

    private final LanDiscoveryPlugin implementation = new LanDiscoveryPlugin();
    private DatagramSocket udpResponderSocket;
    private ExecutorService discoveryExecutor;
    private NsdManager.RegistrationListener mdnsRegistrationListener;

    @Override
    public void load() {
        super.load();
        this.discoveryExecutor = Executors.newSingleThreadExecutor();
        startUdpDiscoveryResponder();
        registerMdnsService();
    }

    @PluginMethod
    public void startDiscovery(PluginCall call) {
        boolean includeLoopback = call.getBoolean("includeLoopback", false);
        boolean enableProbeFallback = call.getBoolean("enableProbeFallback", true);
        String discoveryMode = call.getString("discoveryMode", "hybrid");
        boolean reset = call.getBoolean("reset", true);
        Integer scanWindowMs = call.getInt("scanWindowMs", null);
        int port = call.getInt("port", DEFAULT_TCP_PORT);
        int timeoutMs = call.getInt("timeoutMs", DEFAULT_TIMEOUT_MS);
        int discoveryTimeoutMs = call.getInt("discoveryTimeoutMs", DEFAULT_DISCOVERY_TIMEOUT_MS);
        String mdnsServiceType = call.getString("mdnsServiceType", DEFAULT_MDNS_SERVICE_TYPE);
        Integer maxProbeHosts = call.getInt("maxProbeHosts", null);
        List<String> manualTargets = toStringList(call.getArray("manualTargets", new JSArray()));
        List<String> subnetCidrs = toStringList(call.getArray("subnetCidrs", new JSArray()));
        List<String> discoveryTargets = collectAutoDiscoveryTargets(
            discoveryMode,
            mdnsServiceType,
            discoveryTimeoutMs
        );
        Set<String> localAddresses = collectLocalIpv4Addresses(includeLoopback);
        List<String> combinedTargets = new ArrayList<>(manualTargets);
        for (String target : discoveryTargets) {
            if (localAddresses.contains(target)) {
                continue;
            }
            if (!combinedTargets.contains(target)) {
                combinedTargets.add(target);
            }
        }
        String mode = discoveryMode == null ? "hybrid" : discoveryMode;
        if (combinedTargets.isEmpty() && "hybrid".equals(mode)) {
            List<String> udpFallbackTargets = discoverByUdp(discoveryTimeoutMs);
            for (String target : udpFallbackTargets) {
                if (localAddresses.contains(target)) {
                    continue;
                }
                if (!combinedTargets.contains(target)) {
                    combinedTargets.add(target);
                }
            }
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
        JSObject result = implementation.listDevices();
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
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
        int timeoutMs
    ) {
        String mode = discoveryMode == null ? "hybrid" : discoveryMode;
        boolean shouldRunMdns = "hybrid".equals(mode) || "mdns".equals(mode);
        boolean shouldRunUdpFallback = "hybrid".equals(mode);
        Set<String> discovered = new LinkedHashSet<>();
        if (shouldRunMdns) {
            discovered.addAll(discoverByMdns(mdnsServiceType, timeoutMs));
        }
        if (discovered.isEmpty() && shouldRunUdpFallback) {
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
                // noop
            }

            @Override
            public void onDiscoveryStopped(String serviceType) {
                latch.countDown();
            }

            @Override
            public void onServiceFound(NsdServiceInfo serviceInfo) {
                nsdManager.resolveService(serviceInfo, new NsdManager.ResolveListener() {
                    @Override
                    public void onResolveFailed(NsdServiceInfo serviceInfo, int errorCode) {
                        // noop
                    }

                    @Override
                    public void onServiceResolved(NsdServiceInfo serviceInfo) {
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
        } catch (Exception ignored) {
            // noop
        } finally {
            try {
                nsdManager.stopServiceDiscovery(listener);
            } catch (Exception ignored) {
                // noop
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
            DatagramPacket packet = new DatagramPacket(
                request,
                request.length,
                InetAddress.getByName("255.255.255.255"),
                UDP_DISCOVERY_PORT
            );
            socket.send(packet);

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
                    if (address != null && !address.isBlank()) {
                        discovered.add(address);
                    }
                } catch (Exception ignored) {
                    // timeout or malformed payload
                }
            }
        } catch (Exception ignored) {
            // noop
        }
        return new ArrayList<>(discovered);
    }

    private void startUdpDiscoveryResponder() {
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
                    if (!UDP_DISCOVERY_MAGIC.equals(payload)) {
                        continue;
                    }
                    JSONObject response = new JSONObject();
                    response.put("appId", APP_ID);
                    response.put("protocolVersion", PROTOCOL_VERSION);
                    response.put("port", DEFAULT_TCP_PORT);
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
                // noop
            }
        });
    }

    private void stopUdpDiscoveryResponder() {
        if (udpResponderSocket != null && !udpResponderSocket.isClosed()) {
            udpResponderSocket.close();
        }
        udpResponderSocket = null;
    }

    @SuppressLint("MissingPermission")
    private void registerMdnsService() {
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
            // noop
        } finally {
            mdnsRegistrationListener = null;
        }
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
