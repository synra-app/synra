import Foundation
import Network

@objc public class LanDiscoveryPlugin: NSObject {
    internal let appId = "synra"
    internal let protocolVersion = "1.0"
    internal let defaultTcpPort: UInt16 = 32100
    internal let defaultScanWindowMs = 15_000
    internal let defaultDiscoveryTimeoutMs = 1500
    internal let defaultMdnsServiceType = "_synra._tcp."
    internal let udpDiscoveryPort: UInt16 = 32101
    internal let udpDiscoveryMagic = "SYNRA_DISCOVERY_V1"
    internal let unifiedDeviceUuidDefaultsKey = "synra.preferences.synra.device.instance-uuid"
    /// Full UserDefaults key (matches `SynraPreferences` for `synra.device.basic-info` JSON).
    internal let deviceBasicInfoDefaultsKey = "synra.preferences.synra.device.basic-info"
    /// Legacy display-name; read once to migrate into basic-info.
    internal let legacyDeviceDisplayNameDefaultsKey = "synra.preferences.synra.device.display-name"
    /// SynraPreferences JSON for paired peers (`synra.device.paired-peers`).
    internal let pairedDevicesDefaultsKey = "synra.preferences.synra.device.paired-peers"
    internal let legacyLanDeviceUuidKey = "synra.lan-discovery.device-uuid"
    internal var state: String = "idle"
    internal var startedAt: Int?
    internal var scanWindowMs: Int = 15_000
    internal var devices: [String: DeviceRecord] = [:]
    internal var advertisedService: NetService?
    internal var udpResponderSocket: Int32 = -1
    internal var udpResponderSource: DispatchSourceRead?
    internal let udpResponderQueue = DispatchQueue(label: "com.synra.lan-discovery.udp-responder")
    internal let tcpServerQueue = DispatchQueue(label: "com.synra.lan-discovery.tcp-server")
    internal var tcpListener: NWListener?
    internal var inboundConnections: [String: InboundConnectionContext] = [:]
    internal var outboundConnections: [String: OutboundConnectionContext] = [:]
    internal var outboundHostPortToSessionId: [String: String] = [:]

    public var onSessionOpened: (([String: Any]) -> Void)?
    public var onSessionClosed: (([String: Any]) -> Void)?
    public var onMessageReceived: (([String: Any]) -> Void)?
    public var onTransportError: (([String: Any]) -> Void)?
    /// Inbound TCP hello (non-probe): peer row for JS list — matches Android `deviceFound` / `deviceUpdated`.
    public var onDiscoveredPeerDevice: (([String: Any]) -> Void)?

    public override init() {
        super.init()
    }

    deinit {
        stopBackgroundDiscoveryServices()
    }
}
