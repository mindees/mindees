// swift-tools-version:5.9
//
// ⚠️ AUTHORED — PENDING VERIFICATION. This is a real Swift package, but it has NOT
// been compiled or run by the MindeesNative maintainers (no macOS/Xcode in the
// project's dev or CI environment). The command-decode + apply + validation core is
// unit-tested via `swift test` (no simulator needed); the UIKit renderer is the
// device-facing layer. Please build/run it and report issues. See README.md.

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
