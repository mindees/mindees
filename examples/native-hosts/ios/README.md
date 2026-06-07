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
  UIKitRenderer.swift        # UIView renderer (the device-facing layer; #if canImport(UIKit)):
                             #   flex (UIStackView + Auto Layout), scroll + horizontal scroll,
                             #   text composition + styling, images (data-URI/base64 + bundled
                             #   asset), TextInput (keyboard/secure/editable), ActivityIndicator,
                             #   the box model, elevation/shadow, border radius, value-carrying
                             #   input/change events
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
    onEvent: { handlerId, value in
        try? bridge.dispatchEvent(handlerId: handlerId, value: value) // -> MindeesApp.dispatchEvent
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
`dispatchEvent(handlerId, nil)` and input/change callbacks call
`dispatchEvent(handlerId, value)` back into the same runtime — the JS layer wraps a
non-nil value as `{ target: { value } }`.

## Status

- **Phase 8C** - implements the 8B conformance contract; CI compiles the package for
  iOS (incl. `UIKitRenderer`) and runs `swift test`.
- **Phase 8E** - `UIKitRenderTests` renders a command stream into real `UIView`s on
  an iOS Simulator (`xcodebuild test`) and asserts the hierarchy + updates + disposal.
- **Phase 8F-C** - `MindeesRuntimeBridge` + `JavaScriptCoreMindeesRuntime` embed a JS
  counter app, apply emitted command batches, and route a `UIButton` `.touchUpInside`
  target/action callback back into `MindeesApp.dispatchEvent(handlerId)` in the iOS
  Simulator test. Input/change events carry the field's current text back to JS.
- **UIKit parity** (broadly tracks the Android `AndroidViewRenderer`): flex
  (UIStackView + Auto Layout: direction, `space-between`, align, gap, padding), explicit
  numeric box model, scroll + horizontal scroll, text composition + styling
  (color/size/weight/align/numberOfLines), data-URI/base64 + bundled-asset images,
  `TextInput` (placeholder/value/keyboard/secure/editable), `ActivityIndicator`,
  background/border/radius/opacity, and elevation→shadow. Honest deferred gaps:
  flex-wrap, `space-around`/`evenly` + per-child `alignSelf`/`flexGrow`, `'100%'`/`'auto'`
  sizing, remote (http) image loading, and multiline `UITextView` — see the
  `UIKitRenderer.swift` header.
- Physical-device smoke execution is still pending. Extend `UIKitRenderer.makeElement`
  / `setProp` to map further tags/props onto a fuller design system.
