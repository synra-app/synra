package com.synra.plugins.landiscovery;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
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

    /** Per-host metadata from mDNS/UDP (Synra TXT / JSON); no display strings. */
    public static final class DiscoveryHint {
        public final String sourceDeviceId;
        public final int synraPort;

        public DiscoveryHint(String sourceDeviceId, int synraPort) {
            this.sourceDeviceId = sourceDeviceId;
            this.synraPort = synraPort;
        }
    }

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

    void mergeCandidateDevices(
        List<String> ips,
        Set<String> manualHosts,
        Map<String, DiscoveryHint> hintsByHost
    ) {
        long now = System.currentTimeMillis();
        for (String host : ips) {
            if (host == null) {
                continue;
            }
            String trimmed = host.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            DiscoveryHint hint = hintsByHost.get(trimmed);
            String sourceDeviceId = hint != null && hint.sourceDeviceId != null ? hint.sourceDeviceId.trim() : "";
            String stableId = Objects.requireNonNull(
                LanDiscoveryIdUtils.canonicalLanDeviceId(
                    !sourceDeviceId.isEmpty() ? sourceDeviceId : trimmed
                )
            );
            String source = manualHosts.contains(trimmed) ? "manual" : "mdns";
            boolean trustedLanIdentity =
                !manualHosts.contains(trimmed) && !sourceDeviceId.isEmpty();
            String name = trimmed;
            int synraPort = hint != null && hint.synraPort > 0 ? hint.synraPort : 0;
            this.devices.put(
                stableId,
                new DeviceRecord(
                    stableId,
                    name,
                    trimmed,
                    synraPort,
                    source,
                    trustedLanIdentity,
                    trustedLanIdentity ? Long.valueOf(now) : null,
                    null,
                    now,
                    now
                )
            );
        }
    }

    /**
     * SYNRA-COMM::DEVICE_HANDSHAKE::CONNECT::PROBE_BATCH — apply native probe rows to the device map.
     */
    public synchronized void applySynraProbeJsonResults(org.json.JSONArray results, int fallbackPort, long now) {
        if (results == null) {
            return;
        }
        for (int i = 0; i < results.length(); i += 1) {
            org.json.JSONObject row = results.optJSONObject(i);
            if (row == null) {
                continue;
            }
            String host = row.optString("host", "").trim();
            if (host.isEmpty()) {
                continue;
            }
            boolean ok = row.optBoolean("ok", false);
            if (!ok) {
                continue;
            }
            String wireId = row.optString("wireSourceDeviceId", "").trim();
            if (wireId.isEmpty()) {
                continue;
            }
            String stableId = Objects.requireNonNull(LanDiscoveryIdUtils.canonicalLanDeviceId(wireId));
            int port = row.optInt("port", fallbackPort);
            if (port <= 0) {
                port = fallbackPort;
            }
            this.devices.put(
                stableId,
                new DeviceRecord(
                    stableId,
                    host,
                    host,
                    port,
                    "probe",
                    true,
                    Long.valueOf(now),
                    null,
                    now,
                    now
                )
            );
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
                    long t = System.currentTimeMillis();
                    result.add(new DeviceRecord(
                        ipAddress,
                        ipAddress,
                        ipAddress,
                        0,
                        "mdns",
                        false,
                        null,
                        null,
                        t,
                        t
                    ));
                }
            }
        } catch (Exception ignored) {
            return result;
        }

        return result;
    }

}
