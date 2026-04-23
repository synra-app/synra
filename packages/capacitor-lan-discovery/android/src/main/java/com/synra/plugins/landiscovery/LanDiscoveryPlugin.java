package com.synra.plugins.landiscovery;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

public class LanDiscoveryPlugin {
    private static final int DEFAULT_SCAN_WINDOW_MS = 15000;

    private String state = "idle";
    private Long startedAt = null;
    private int scanWindowMs = DEFAULT_SCAN_WINDOW_MS;
    private final Map<String, DeviceRecord> devices = new LinkedHashMap<>();

    @SuppressWarnings("unused")
    public synchronized JSObject startDiscovery(
        boolean includeLoopback,
        List<String> manualTargets,
        boolean enableProbeFallback,
        String discoveryMode,
        List<String> subnetCidrs,
        Integer maxProbeHosts,
        boolean reset,
        Integer requestedScanWindowMs
    ) {
        if (reset) {
            devices.clear();
        }

        this.state = "scanning";
        this.startedAt = System.currentTimeMillis();
        this.scanWindowMs = requestedScanWindowMs != null ? requestedScanWindowMs : DEFAULT_SCAN_WINDOW_MS;

        List<DeviceRecord> interfaceDevices = collectInterfaceDevices(includeLoopback);
        pruneSelfDevices(interfaceDevices);

        JSObject result = listDevices();
        result.put("requestId", UUID.randomUUID().toString());
        return result;
    }

    public synchronized JSObject stopDiscovery() {
        this.state = "idle";
        JSObject result = new JSObject();
        result.put("success", true);
        return result;
    }

    public synchronized JSObject listDevices() {
        JSObject result = new JSObject();
        result.put("state", this.state);
        if (this.startedAt != null) {
            result.put("startedAt", this.startedAt);
        }
        result.put("scanWindowMs", this.scanWindowMs);
        result.put("devices", toDeviceArray());
        return result;
    }

    private JSArray toDeviceArray() {
        JSArray array = new JSArray();
        for (DeviceRecord device : this.devices.values()) {
            array.put(device.toJSObject());
        }
        return array;
    }

    void mergeCandidateDevices(List<String> ips, Set<String> manualHosts) {
        long now = System.currentTimeMillis();
        for (String host : ips) {
            if (host == null) {
                continue;
            }
            String trimmed = host.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            String stableId = Objects.requireNonNull(LanDiscoveryIdUtils.canonicalLanDeviceId("synra-candidate:" + trimmed));
            String source = manualHosts.contains(trimmed) ? "manual" : "mdns";
            this.devices.put(stableId, new DeviceRecord(stableId, trimmed, trimmed, source, false, null, null, now, now));
        }
    }

    private void pruneSelfDevices(List<DeviceRecord> interfaceDevices) {
        Set<String> localIps = new HashSet<>();
        for (DeviceRecord local : interfaceDevices) {
            localIps.add(local.ipAddress);
        }
        if (localIps.isEmpty()) {
            return;
        }
        List<String> toDelete = new ArrayList<>();
        for (Map.Entry<String, DeviceRecord> entry : this.devices.entrySet()) {
            DeviceRecord value = entry.getValue();
            if (localIps.contains(value.ipAddress)) {
                toDelete.add(entry.getKey());
            }
        }
        for (String key : toDelete) {
            this.devices.remove(key);
        }
    }

    private List<DeviceRecord> collectInterfaceDevices(boolean includeLoopback) {
        List<DeviceRecord> result = new ArrayList<>();
        String host = safeHostName();
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            if (interfaces == null) {
                return result;
            }

            for (NetworkInterface networkInterface : Collections.list(interfaces)) {
                try {
                    if (!networkInterface.isUp()) {
                        continue;
                    }
                } catch (Exception ignored) {
                    continue;
                }

                Enumeration<InetAddress> addresses = networkInterface.getInetAddresses();
                for (InetAddress address : Collections.list(addresses)) {
                    if (!(address instanceof Inet4Address)) {
                        continue;
                    }

                    if (address.isLoopbackAddress() && !includeLoopback) {
                        continue;
                    }

                    String ipAddress = address.getHostAddress();
                    String key = host + ":" + ipAddress;
                    result.add(new DeviceRecord(
                        hashDeviceId(key),
                        host + " (" + networkInterface.getName() + ")",
                        ipAddress,
                        "mdns",
                        false,
                        null,
                        null,
                        System.currentTimeMillis(),
                        System.currentTimeMillis()
                    ));
                }
            }
        } catch (Exception ignored) {
            return result;
        }

        return result;
    }

    private static String safeHostName() {
        String host = "android-host";
        try {
            String value = InetAddress.getLocalHost().getHostName();
            if (value != null && !value.isBlank()) {
                host = value;
            }
        } catch (Exception ignored) {
            // keep fallback
        }
        return host;
    }

    private static String hashDeviceId(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            byte[] bytes = digest.digest(value.getBytes());
            StringBuilder builder = new StringBuilder();
            for (int i = 0; i < bytes.length && builder.length() < 12; i += 1) {
                builder.append(String.format("%02x", bytes[i]));
            }
            return "device-" + builder;
        } catch (Exception ignored) {
            return "device-" + Math.abs(value.hashCode());
        }
    }

}
