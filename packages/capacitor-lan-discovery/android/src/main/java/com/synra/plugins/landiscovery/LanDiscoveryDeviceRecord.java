package com.synra.plugins.landiscovery;

import com.getcapacitor.JSObject;

final class DeviceRecord {
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

    DeviceRecord merge(DeviceRecord incoming) {
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

    DeviceRecord withConnectable(boolean connectable, String connectCheckError) {
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

    DeviceRecord withDeviceId(String newDeviceId, String newName) {
        return new DeviceRecord(
            newDeviceId,
            newName,
            this.ipAddress,
            this.source,
            this.connectable,
            this.connectCheckAt,
            this.connectCheckError,
            this.discoveredAt,
            this.lastSeenAt
        );
    }

    DeviceRecord withName(String newName) {
        return new DeviceRecord(
            this.deviceId,
            newName,
            this.ipAddress,
            this.source,
            this.connectable,
            this.connectCheckAt,
            this.connectCheckError,
            this.discoveredAt,
            this.lastSeenAt
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
