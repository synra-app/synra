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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
        mergeDevices(interfaceDevices);
        mergeDevices(collectManualDevices(manualTargets));

        if (enableProbeFallback) {
            mergeDevices(collectProbeCandidates(interfaceDevices));
        }

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

    public synchronized JSObject pairDevice(String deviceId) {
        DeviceRecord selected = this.devices.get(deviceId);
        if (selected == null) {
            return null;
        }

        DeviceRecord paired = selected.withPaired(true);
        this.devices.put(paired.deviceId, paired);
        JSObject result = new JSObject();
        result.put("success", true);
        result.put("device", paired.toJSObject());
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

    private List<DeviceRecord> collectProbeCandidates(List<DeviceRecord> seeds) {
        if (seeds.isEmpty()) {
            return List.of();
        }

        String[] octets = seeds.get(0).ipAddress.split("\\.");
        if (octets.length != 4) {
            return List.of();
        }

        try {
            int tail = Integer.parseInt(octets[3]);
            int probeTail = tail >= 254 ? 1 : tail + 1;
            String probeIp = octets[0] + "." + octets[1] + "." + octets[2] + "." + probeTail;
            return List.of(new DeviceRecord(
                hashDeviceId("probe:" + probeIp),
                "Probe Candidate",
                probeIp,
                "probe",
                false,
                false,
                null,
                null,
                System.currentTimeMillis(),
                System.currentTimeMillis()
            ));
        } catch (NumberFormatException ignored) {
            return List.of();
        }
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
        private final boolean paired;
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
            boolean paired,
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
            this.paired = paired;
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
                this.paired || incoming.paired,
                incoming.connectable,
                incoming.connectCheckAt,
                incoming.connectCheckError,
                this.discoveredAt,
                System.currentTimeMillis()
            );
        }

        private DeviceRecord withPaired(boolean paired) {
            return new DeviceRecord(
                this.deviceId,
                this.name,
                this.ipAddress,
                this.source,
                paired,
                this.connectable,
                this.connectCheckAt,
                this.connectCheckError,
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
                this.paired,
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
            object.put("paired", this.paired);
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
