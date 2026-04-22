package com.synra.plugins.landiscovery;

final class ProbeOutcome {
    final boolean connectable;
    final String error;
    final String remoteDeviceId;
    final String remoteDisplayName;

    ProbeOutcome(
        boolean connectable,
        String error,
        String remoteDeviceId,
        String remoteDisplayName
    ) {
        this.connectable = connectable;
        this.error = error;
        this.remoteDeviceId = remoteDeviceId;
        this.remoteDisplayName = remoteDisplayName;
    }
}
