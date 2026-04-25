package com.getcapacitor;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import com.synra.plugins.deviceconnection.DeviceConnectionPlugin;
import java.lang.reflect.Method;
import org.json.JSONObject;
import org.junit.Test;

public class ExampleUnitTest {

    @Test
    public void mapWireEventName_mapsLegacyTransportTypes() throws Exception {
        DeviceConnectionPlugin plugin = new DeviceConnectionPlugin();
        Method mapWireEventName = DeviceConnectionPlugin.class.getDeclaredMethod("mapWireEventName", String.class);
        mapWireEventName.setAccessible(true);

        assertEquals("device.tcp.connect", mapWireEventName.invoke(plugin, "connect"));
        assertEquals("device.tcp.connect.ack", mapWireEventName.invoke(plugin, "connectAck"));
        assertEquals("device.tcp.ack", mapWireEventName.invoke(plugin, "ack"));
        assertEquals("device.tcp.close", mapWireEventName.invoke(plugin, "close"));
        assertEquals("device.tcp.error", mapWireEventName.invoke(plugin, "error"));
        assertEquals("device.tcp.heartbeat", mapWireEventName.invoke(plugin, "heartbeat"));
    }

    @Test
    public void buildTransportErrorEventFromWire_normalizesPayload() throws Exception {
        DeviceConnectionPlugin plugin = new DeviceConnectionPlugin();
        Method buildTransportErrorEventFromWire = DeviceConnectionPlugin.class.getDeclaredMethod(
            "buildTransportErrorEventFromWire",
            JSONObject.class,
            String.class
        );
        buildTransportErrorEventFromWire.setAccessible(true);

        JSONObject frame = new JSONObject();
        JSONObject payload = new JSONObject();
        payload.put("code", "CONNECT_INVALID");
        payload.put("message", "invalid connect payload");
        frame.put("payload", payload);

        JSONObject event = (JSONObject) buildTransportErrorEventFromWire.invoke(plugin, frame, "device-a");
        assertEquals("device-a", event.getString("deviceId"));
        assertEquals("CONNECT_INVALID", event.getString("code"));
        assertEquals("invalid connect payload", event.getString("message"));
        assertEquals("tcp", event.getString("transport"));
    }

    @Test
    public void isPairingWireEvent_checksPrefix() throws Exception {
        DeviceConnectionPlugin plugin = new DeviceConnectionPlugin();
        Method isPairingWireEvent = DeviceConnectionPlugin.class.getDeclaredMethod("isPairingWireEvent", String.class);
        isPairingWireEvent.setAccessible(true);

        assertTrue((boolean) isPairingWireEvent.invoke(plugin, "device.pairing.request"));
    }
}
