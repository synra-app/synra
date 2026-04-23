package com.synra.plugins.landiscovery;

import com.getcapacitor.JSObject;

final class DeviceRecord {
    private static final int DEFAULT_TCP_PORT = 32100;
    final String deviceId;
    final String name;
    final String ipAddress;
    final String source;
    final boolean connectable;
    final Long connectCheckAt;
    final String connectCheckError;
    final long discoveredAt;
    final long lastSeenAt;

    DeviceRecord(
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

    JSObject toJSObject() {
        JSObject object = new JSObject();
        object.put("deviceId", this.deviceId);
        object.put("name", this.name);
        object.put("ipAddress", this.ipAddress);
        object.put("port", DEFAULT_TCP_PORT);
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
