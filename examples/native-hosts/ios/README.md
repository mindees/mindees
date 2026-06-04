# MindeesNativeHost - iOS reference host (Swift Package)

> **CI-verified: compiles, passes conformance, renders on an iOS Simulator, and
> exercises an embedded JavaScriptCore JS<->native bridge.** A GitHub Actions macOS
> runner ([`.github/workflows/native-ios.yml`](../../../.github/workflows/native-ios.yml))
> runs `swift build` + `swift test`, compiles the package (incl. `UIKitRenderer`) for
> the iOS SDK, and runs `UIKitRenderTests` / `MindeesRuntimeBridgeTests` on an
> **iOS Simulator** (`xcodebuild test`). What is **not** yet verified: physical-device
> smoke execution or app-store packaging. Not a production host.

A reference iOS host that replays the MindeesNative **native command stream** (from
`@mindees/renderer`'s `createNativeCommandBackend()`) into UIKit views. It
implements the exact contract that `@mindees/renderer`'s `createReferenceHost()`
specifies and tests (Phase 8B).

## Layout

```text
Package.swift
Sources/MindeesNativeHost/
  NativeCommand.swift        # Codable wire model (NativeCommand / NativePropValue / NativeNodeId)
  MindeesNativeHost.swift    # generic host: applies + strictly validates the stream
  MindeesRuntimeBridge.swift # JavaScriptCore runtime bridge + generic bridge contract
  ModelRenderer.swift        # in-memory renderer (no UIKit) - used by swift test
  UIKitRenderer.swift        # UIView renderer (the device-facing layer; #if canImport(UIKit))
Tests/MindeesNativeHostTests/
  MindeesNativeHostTests.swift        # mirrors the TS conformance suite
  MindeesRuntimeBridgeTests.swift     # JSCore bridge lifecycle + counter app tests
  UIKitRenderTests.swift              # real UIView render assertions on iOS Simulator
```

## Build + test

```sh
cd examples/native-hosts/ios
swift build
swift test
```

`swift test` runs the host's command-apply and validation logic via
`ModelRenderer`, plus the JavaScriptCore bridge lifecycle and counter-app flow on
macOS. `UIKitRenderer` is conditionally compiled (`#if canImport(UIKit)`), so the
real UIKit hierarchy and `UIButton` target/action bridge smoke test run through the
workflow's iOS Simulator `xcodebuild test` step. The simulator test runs as a
hostless XCTest bundle, so it invokes the registered `.touchUpInside` target/action
callback directly rather than synthesizing a full app-hosted touch event.

## Use it on a device

```swift
import MindeesNativeHost
import UIKit

let container = UIView()
let renderer = UIKitRenderer()
var bridge: MindeesRuntimeBridge<UIKitRenderer>!

let host = MindeesNativeHost(
    rootId: "host-root",
    root: container,
    renderer: renderer,
    onEvent: { handlerId in
        try? bridge.dispatchEvent(handlerId: handlerId) // -> MindeesApp.dispatchEvent
    }
)

bridge = MindeesRuntimeBridge(
    host: host,
    runtime: JavaScriptCoreMindeesRuntime(source: appSource)
)

try bridge.start()
```

The embedded script must expose `globalThis.MindeesApp = { start, dispatchEvent }`.
During `start()`, JavaScript sends serialized command batches through
`MindeesHost.emit(JSON.stringify(commands))`; native `press` callbacks call
`dispatchEvent(handlerId)` back into the same runtime.

## Status

- **Phase 8C** - implements the 8B conformance contract; CI compiles the package for
  iOS (incl. `UIKitRenderer`) and runs `swift test`.
- **Phase 8E** - `UIKitRenderTests` renders a command stream into real `UIView`s on
  an iOS Simulator (`xcodebuild test`) and asserts the hierarchy + updates + disposal.
- **Phase 8F-C** - `MindeesRuntimeBridge` + `JavaScriptCoreMindeesRuntime` embed a JS
  counter app, apply emitted command batches, and route a `UIButton` `.touchUpInside`
  target/action callback back into `MindeesApp.dispatchEvent(handlerId)` in the iOS
  Simulator test.
- Physical-device smoke execution is still pending. The tag-to-view mapping and prop
  application are an intentional MVP - extend `UIKitRenderer.makeElement` / `setProp`
  for a real design system.
