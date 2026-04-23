// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SynraCapacitorLanDiscovery",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "SynraCapacitorLanDiscovery",
            targets: ["LanDiscoveryPluginPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "LanDiscoveryPluginPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/LanDiscoveryPluginPlugin",
            // Explicit list so Xcode/SwiftPM always compiles every split file with the same target
            // (avoids “Cannot find type … in scope” when discovery or target membership is stale).
            sources: [
                "LanDiscoveryDeviceRecord.swift",
                "LanDiscoveryInboundContext.swift",
                "LanDiscoveryMdnsCollector.swift",
                "LanDiscoveryPlugin+Identity.swift",
                "LanDiscoveryPlugin+InboundTcp.swift",
                "LanDiscoveryPlugin+MdnsAdvertise.swift",
                "LanDiscoveryPlugin+NetworkScan.swift",
                "LanDiscoveryPlugin+Probe.swift",
                "LanDiscoveryPlugin+PublicAPI.swift",
                "LanDiscoveryPlugin+TcpFraming.swift",
                "LanDiscoveryPlugin+UdpResponder.swift",
                "LanDiscoveryPlugin.swift",
                "LanDiscoveryPluginPlugin.swift",
                "LanDiscoveryProbeOutcome.swift",
            ]),
        .testTarget(
            name: "LanDiscoveryPluginPluginTests",
            dependencies: ["LanDiscoveryPluginPlugin"],
            path: "ios/Tests/LanDiscoveryPluginPluginTests")
    ]
)