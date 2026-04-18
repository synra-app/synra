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
            path: "ios/Sources/LanDiscoveryPluginPlugin"),
        .testTarget(
            name: "LanDiscoveryPluginPluginTests",
            dependencies: ["LanDiscoveryPluginPlugin"],
            path: "ios/Tests/LanDiscoveryPluginPluginTests")
    ]
)