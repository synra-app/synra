package com.synra.plugins.landiscovery;

import java.net.InetAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

final class LanDiscoveryIdUtils {
    private LanDiscoveryIdUtils() {}

    static String normalizePeerHost(String sourceHostIp, Socket socket) {
        if (sourceHostIp != null) {
            String trimmed = sourceHostIp.trim();
            if (isIpv4Address(trimmed)) {
                return trimmed;
            }
        }
        InetAddress peerAddr = socket.getInetAddress();
        if (peerAddr == null) {
            return null;
        }
        String observed = peerAddr.getHostAddress();
        if (observed == null || observed.isBlank() || observed.contains(":")) {
            return null;
        }
        return observed;
    }

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
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) {
            return trimmed;
        }
        if (trimmed.startsWith("device-") && trimmed.length() >= "device-".length() + 8) {
            return trimmed;
        }
        return hashDeviceId(trimmed);
    }

    private static String hashDeviceId(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder();
            for (byte current : bytes) {
                if (builder.length() >= 12) {
                    break;
                }
                builder.append(String.format("%02x", current));
            }
            return "device-" + builder;
        } catch (Exception ignored) {
            return "device-" + Math.abs(value.hashCode());
        }
    }
}
