# MindeesNativeHost — iOS reference host (Swift Package)

> ⚠️ **Authored — pending verification.** This is a real Swift package, but it has
> **not** been compiled or run by the MindeesNative maintainers: there is no
> macOS/Xcode toolchain in the project's dev or CI environment. It is provided so
> you can build, run, and verify it. Please report what needs fixing. It is **not**
> claimed to work until someone compiles + runs it.

A reference iOS host that replays the MindeesNative **native command stream** (from
`@mindees/renderer`'s `createNativeCommandBackend()`) into UIKit views. It
implements the exact contract that `@mindees/renderer`'s `createReferenceHost()`
specifies and tests (Phase 8B).

## Layout

```
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

- ✅ Implements the Phase 8B conformance contract (decode → apply → strict validate).
- 🔬 **Phase 8C** = a *verified*, runnable iOS host (this package compiled + run on a
  device, wired to a real JS↔native bridge). The bridge transport is out of scope here.
- The tag→view mapping and prop application are an intentional MVP — extend
  `UIKitRenderer.makeElement` / `setProp` for a real design system.
