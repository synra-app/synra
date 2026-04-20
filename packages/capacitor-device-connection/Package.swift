// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SynraCapacitorDeviceConnection",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "SynraCapacitorDeviceConnection",
            targets: ["DeviceConnectionPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "DeviceConnectionPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/DeviceConnectionPlugin"),
        .testTarget(
            name: "DeviceConnectionPluginTests",
            dependencies: ["DeviceConnectionPlugin"],
            path: "ios/Tests/DeviceConnectionPluginTests")
    ]
)