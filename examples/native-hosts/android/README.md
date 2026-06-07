# MindeesNativeHost — Android reference host (Gradle)

> ✅ **CI-verified: compiles + conformance core + renders via Robolectric.** A GitHub
> Actions Linux runner with the Android SDK
> ([`.github/workflows/native-android.yml`](../../../.github/workflows/native-android.yml))
> runs `:mindees-host:test` (incl. a **Robolectric** render test against real
> `android.view` widgets, with click dispatch via `performClick()`) and
> `:mindees-host:assembleDebug` (compiles `AndroidViewRenderer`) on every change.
> The same workflow now runs `:mindees-example-app:testDebugUnitTest`,
> `:mindees-example-app:assembleDebug`, and
> `:mindees-example-app:connectedDebugAndroidTest` on an Android API 35 emulator.
> The connected test boots the example Activity running a **real multi-screen
> MindeesNative app** (signals + Atlas primitives + the Quantum router + the Helix
> reconciler, all executing in QuickJS from the bundled asset), then asserts the
> native view tree, performs native clicks, and verifies signal reactivity, router
> navigation (native subtree swap), cross-route state survival, and device-hook
> values — all through the embedded QuickJS bridge. AGP 9.2 / Gradle 9.4.1 / JDK
> 17. What is **not** yet verified: physical-device smoke execution. To open
> locally, use Android
> Studio (it provides Gradle); align the AGP/SDK versions in `settings.gradle.kts`
> / module build files with your toolchain if Gradle complains. Not a production
> host.

A reference Android host that replays the MindeesNative **native command stream**
(from `@mindees/renderer`'s `createNativeCommandBackend()`) into `android.view`
widgets. It implements the exact contract that `@mindees/renderer`'s
`createReferenceHost()` specifies and tests (Phase 8B).

## Layout

```text
settings.gradle.kts / build.gradle.kts / gradle.properties
mindees-host/
  build.gradle.kts
  src/main/AndroidManifest.xml
  src/main/kotlin/dev/mindees/host/
    NativeCommand.kt        # sealed wire model + NativeCommandCodec (org.json)
    MindeesNativeHost.kt    # generic host (apply + strict validate) + HostRenderer + ModelRenderer
    AndroidViewRenderer.kt  # android.view renderer: full flex (FlexboxLayout), scroll +
                            #   horizontal scroll, text composition + styling, images,
                            #   TextInput, ActivityIndicator, elevation, per-corner radii,
                            #   a full-screen overlay/portal layer, value-carrying events
  src/test/kotlin/dev/mindees/host/
    MindeesNativeHostTest.kt  # mirrors the TS conformance suite (JVM, ModelRenderer)
mindees-example-app/
  build.gradle.kts
  src/main/AndroidManifest.xml
  src/main/kotlin/dev/mindees/example/
    MainActivity.kt            # runnable Android app
    MindeesRuntimeBridge.kt    # JSON command bridge + QuickJS runtime adapter
    FrameDriver.kt             # vsync-driven JS frame loop (Choreographer, active only while animating)
  src/androidTest/kotlin/dev/mindees/example/
    MindeesExampleInstrumentedTest.kt
  src/test/kotlin/dev/mindees/example/
    MindeesRuntimeBridgeTest.kt
```

## Build + test (JVM unit tests — no device needed)

> This project ships **no Gradle wrapper jar**. If you don't open it in Android
> Studio, first bootstrap one with a system Gradle (matching CI):
> `gradle wrapper --gradle-version 9.4.1`. Then use `./gradlew` as below.

```sh
cd examples/native-hosts/android
./gradlew :mindees-host:test     # apply + strict validation + JSON-codec, on the JVM
./gradlew :mindees-host:assemble # compile the Android library (needs the SDK)
./gradlew :mindees-example-app:testDebugUnitTest
./gradlew :mindees-example-app:assembleDebug
```

The host, `ModelRenderer`, and `NativeCommandCodec` are exercised by JVM unit
tests (no emulator). `AndroidViewRenderer` is the device-facing layer.

## Connected smoke test (emulator/device needed)

```sh
cd examples/native-hosts/android
./gradlew :mindees-example-app:connectedDebugAndroidTest
```

The connected test launches `MainActivity` on Android — running the real
multi-screen Atlas + Quantum-router app in QuickJS — and drives the whole stack:
it taps a native button and asserts a signal patches only the counter text node,
navigates Home → About (the router swaps the native subtree, with a native
`ProgressBar` for Atlas's `ActivityIndicator`), and navigates back to confirm
module-scoped signal state survived — all through the QuickJS bridge.

## Use the host on a device

```kotlin
val container: ViewGroup = /* your root view */
val renderer = AndroidViewRenderer(context)
val host = MindeesNativeHost(
    rootId = "host-root",
    root = container,
    renderer = renderer,
    onEvent = { handlerId -> bridge.dispatchEvent(handlerId) } // → backend.dispatchEvent
)

// each batch from the JS side (JSON over your bridge):
host.apply(NativeCommandCodec.decodeBatch(json))
```

## Run the example app

```sh
cd examples/native-hosts/android
./gradlew :mindees-example-app:assembleDebug
adb install -r mindees-example-app/build/outputs/apk/debug/mindees-example-app-debug.apk
adb shell am start -n dev.mindees.example/.MainActivity
```

`mindees-example-app` embeds Cash App QuickJS (`app.cash.quickjs:quickjs-android`)
and exposes two bridge interfaces:

- `MindeesHost.emit(json)` is called by JavaScript with a serialized
  `NativeCommand` batch; `MindeesRuntimeBridge` decodes and applies it to
  `MindeesNativeHost`.
- Native events call back through `dispatchEvent(handlerId, value)`, which invokes
  the JavaScript app's `MindeesApp.dispatchEvent(handlerId, value)`. A press is
  notify-only; a TextInput `input`/`change` carries the field's current text.

The bundled app is a real multi-screen MindeesNative app (signals + Atlas
primitives + the Quantum router + the Helix reconciler). It renders native
Android views — including `TextView`/`Button`/`EditText`/`ProgressBar` and a
full-screen overlay layer — reacts to native input and navigates between routes
through the same JSON command protocol used by `@mindees/renderer`.

## Status

- ✅ **Phase 8D** — implements the 8B conformance contract; CI compiles the library
  (incl. `AndroidViewRenderer`) and runs `:mindees-host:test`.
- ✅ **Phase 8E** — `AndroidRenderTest` (Robolectric) renders a command stream into
  real `android.view` widgets, asserts the hierarchy + updates + disposal, and
  verifies click dispatch via `performClick()`. It now covers broad renderer
  parity: full flex (FlexboxLayout: direction, justify incl. `space-*`, align,
  wrap, `alignSelf`, `flexGrow`/`gap`), vertical + horizontal scroll, text
  composition + styling, data-URI/asset images, TextInput (keyboard/secure/
  multiline), `ActivityIndicator`, elevation, per-corner radii, value-carrying
  `input`/`change` events, and a full-screen overlay/portal layer that z-stacks
  above app content.
- ✅ **Phase 8F-A/B** — Android example app with an embedded QuickJS runtime and a
  real JS↔native command bridge. CI unit-tests the bridge contract, assembles the
  APK, and runs an emulator-connected test that drives the real multi-screen
  Atlas + router app (signal reactivity, route navigation, state survival) against
  the live Activity. Physical-device execution remains future Phase 8F work.
- The tag→view mapping and prop application are a curated cross-platform subset —
  extend `AndroidViewRenderer` for a fuller design system.
