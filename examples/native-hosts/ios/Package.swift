// swift-tools-version:5.9
//
// CI-verified by the native iOS workflow. The command-decode + apply + validation
// core, JavaScriptCore bridge, and model-renderer tests run via `swift test`; the
// UIKit renderer + bridge smoke test run on an iOS Simulator. See README.md.

import PackageDescription

let package = Package(
    name: "MindeesNativeHost",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [
        .library(name: "MindeesNativeHost", targets: ["MindeesNativeHost"]),
    ],
    targets: [
        .target(name: "MindeesNativeHost"),
        .testTarget(name: "MindeesNativeHostTests", dependencies: ["MindeesNativeHost"]),
    ]
)
