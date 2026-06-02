# MindeesNativeHost — iOS reference host (Swift Package)

> ✅ **CI-verified compile + conformance core; not yet on-device.** A GitHub Actions
> macOS runner ([`.github/workflows/native-ios.yml`](../../../.github/workflows/native-ios.yml))
> runs `swift build` + `swift test` and compiles the package (incl. `UIKitRenderer`)
> for the iOS SDK on every change. What is **not** yet verified: rendering on a real
> device/simulator and a JS↔native bridge (Phase 8E). Not a production host.

A reference iOS host that replays the MindeesNative **native command stream** (from
`@mindees/renderer`'s `createNativeCommandBackend()`) into UIKit views. It
implements the exact contract that `@mindees/renderer`'s `createReferenceHost()`
specifies and tests (Phase 8B).

## Layout

```text
Package.swift
Sources/MindeesNativeHost/
  NativeCommand.swift     # Codable wire model (NativeCommand / NativePropValue / NativeNodeId)
  MindeesNativeHost.swift # generic host: applies + strictly validates the stream; HostRenderer protocol
  ModelRenderer.swift     # in-memory renderer (no UIKit) — used by `swift test`
  UIKitRenderer.swift     # UIView renderer (the device-facing layer; #if canImport(UIKit))
Tests/MindeesNativeHostTests/
  MindeesNativeHostTests.swift  # mirrors the TS conformance suite (uses ModelRenderer)
```

## Build + test (no device needed)

```sh
cd examples/native-hosts/ios
swift build
swift test     # exercises the apply + strict-validation logic via ModelRenderer
```

`swift test` runs the host's command-apply and validation logic on any platform
(macOS/Linux) — no simulator. `UIKitRenderer` is conditionally compiled
(`#if canImport(UIKit)`), so it only participates when building for iOS in Xcode.

## Use it on a device

```swift
import MindeesNativeHost
import UIKit

let container = UIView()                 // your root view
let renderer = UIKitRenderer()
let host = MindeesNativeHost(
    rootId: "host-root",
    root: container,
    renderer: renderer,
    onEvent: { handlerId in bridge.dispatchEvent(handlerId) } // → backend.dispatchEvent
)

// each batch from the JS side (JSON over your bridge):
let commands = try JSONDecoder().decode([NativeCommand].self, from: jsonData)
try host.apply(commands)
```

## Status

- ✅ **Phase 8C** — implements the 8B conformance contract (decode → apply → strict
  validate); CI compiles the package for iOS (incl. `UIKitRenderer`) and runs
  `swift test`.
- 🔬 **Phase 8E** — render on a real device/simulator (UI test) + a JS↔native bridge.
  Not done; the bridge transport is out of scope here.
- The tag→view mapping and prop application are an intentional MVP — extend
  `UIKitRenderer.makeElement` / `setProp` for a real design system.
