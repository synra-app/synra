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
import java.util.Set;
import java.util.UUID;

public class LanDiscoveryPlugin {
    private static final int DEFAULT_SCAN_WINDOW_MS = 15000;

    private String state = "idle";
    private Long startedAt = null;
    private int scanWindowMs = DEFAULT_SCAN_WINDOW_MS;
    private final Map<String, DeviceRecord> devices = new LinkedHashMap<>();

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

        String mode = discoveryMode == null ? "hybrid" : discoveryMode;
        boolean includeManual = !"none".equals(mode);

        List<DeviceRecord> interfaceDevices = collectInterfaceDevices(includeLoopback);
        if (includeManual) {
            mergeDevices(collectManualDevices(manualTargets));
        }
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

    public synchronized DeviceRecord getDevice(String deviceId) {
        return this.devices.get(deviceId);
    }

    public synchronized DeviceRecord updateDeviceConnectable(
        String deviceId,
        boolean connectable,
        String connectCheckError
    ) {
        DeviceRecord selected = this.devices.get(deviceId);
        if (selected == null) {
            return null;
        }

        DeviceRecord updated = selected.withConnectable(connectable, connectCheckError);
        this.devices.put(deviceId, updated);
        return updated;
    }

    private JSArray toDeviceArray() {
        JSArray array = new JSArray();
        for (DeviceRecord device : this.devices.values()) {
            array.put(device.toJSObject());
        }
        return array;
    }

    private void mergeDevices(List<DeviceRecord> incoming) {
        for (DeviceRecord device : incoming) {
            DeviceRecord existing = this.devices.get(device.deviceId);
            if (existing != null) {
                this.devices.put(device.deviceId, existing.merge(device));
            } else {
                this.devices.put(device.deviceId, device);
            }
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
            if ("manual".equals(value.source)) {
                continue;
            }
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

    private List<DeviceRecord> collectManualDevices(List<String> manualTargets) {
        List<DeviceRecord> result = new ArrayList<>();
        int index = 1;
        for (String target : manualTargets) {
            if (target == null) {
                continue;
            }

            String trimmed = target.trim();
            if (trimmed.isEmpty()) {
                continue;
            }

            result.add(new DeviceRecord(
                hashDeviceId("manual:" + trimmed),
                "Manual Target " + index,
                trimmed,
                "manual",
                false,
                null,
                null,
                System.currentTimeMillis(),
                System.currentTimeMillis()
            ));
            index += 1;
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

    static final class DeviceRecord {
        private final String deviceId;
        private final String name;
        private final String ipAddress;
        private final String source;
        private final boolean connectable;
        private final Long connectCheckAt;
        private final String connectCheckError;
        private final long discoveredAt;
        private final long lastSeenAt;

        private DeviceRecord(
            String deviceId,
            String name,
            String ipAddress,
            String source,
            boolean connectable,
            Long connectCheckAt,
            String connectCheckError,
            long discoveredAt,
            long lastSeenAt
        ) {
            this.deviceId = deviceId;
            this.name = name;
            this.ipAddress = ipAddress;
            this.source = source;
            this.connectable = connectable;
            this.connectCheckAt = connectCheckAt;
            this.connectCheckError = connectCheckError;
            this.discoveredAt = discoveredAt;
            this.lastSeenAt = lastSeenAt;
        }

        private DeviceRecord merge(DeviceRecord incoming) {
            return new DeviceRecord(
                this.deviceId,
                incoming.name,
                incoming.ipAddress,
                incoming.source,
                incoming.connectable,
                incoming.connectCheckAt,
                incoming.connectCheckError,
                this.discoveredAt,
                System.currentTimeMillis()
            );
        }

        private DeviceRecord withConnectable(boolean connectable, String connectCheckError) {
            return new DeviceRecord(
                this.deviceId,
                this.name,
                this.ipAddress,
                this.source,
                connectable,
                System.currentTimeMillis(),
                connectCheckError,
                this.discoveredAt,
                System.currentTimeMillis()
            );
        }

        JSObject toJSObject() {
            JSObject object = new JSObject();
            object.put("deviceId", this.deviceId);
            object.put("name", this.name);
            object.put("ipAddress", this.ipAddress);
            object.put("source", this.source);
            object.put("connectable", this.connectable);
            if (this.connectCheckAt != null) {
                object.put("connectCheckAt", this.connectCheckAt);
            }
            if (this.connectCheckError != null) {
                object.put("connectCheckError", this.connectCheckError);
            }
            object.put("discoveredAt", this.discoveredAt);
            object.put("lastSeenAt", this.lastSeenAt);
            return object;
        }
    }
}
