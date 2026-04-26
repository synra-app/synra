package com.synra.plugins.landiscovery;

final class LanDiscoveryIdUtils {
    private LanDiscoveryIdUtils() {}

    static boolean isIpv4Address(String value) {
        if (value == null || value.isBlank() || value.contains(":")) {
            return false;
        }
        String[] parts = value.split("\\.");
        if (parts.length != 4) {
            return false;
        }
        for (String part : parts) {
            if (part == null || part.isBlank()) {
                return false;
            }
            try {
                int parsed = Integer.parseInt(part);
                if (parsed < 0 || parsed > 255) {
                    return false;
                }
            } catch (NumberFormatException error) {
                return false;
            }
        }
        return true;
    }

    static String canonicalLanDeviceId(String raw) {
        if (raw == null) {
            return null;
        }
        return raw.trim();
    }
}
