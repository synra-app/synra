// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SynraCapacitorPreferences",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "SynraCapacitorPreferences",
            targets: ["SynraPreferencesPluginPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "SynraPreferencesPluginPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/SynraPreferencesPluginPlugin"),
        .testTarget(
            name: "SynraPreferencesPluginPluginTests",
            dependencies: ["SynraPreferencesPluginPlugin"],
            path: "ios/Tests/SynraPreferencesPluginPluginTests")
    ]
)
