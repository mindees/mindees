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
> The connected test boots the example Activity, asserts the native `TextView` /
> `Button` tree, performs a native click, and verifies the label updates through
> the embedded QuickJS bridge. AGP 9.2 / Gradle 9.4.1 / JDK 17. What is **not**
> yet verified: physical-device smoke execution. To open locally, use Android
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
    AndroidViewRenderer.kt  # android.view renderer (device-facing layer)
  src/test/kotlin/dev/mindees/host/
    MindeesNativeHostTest.kt  # mirrors the TS conformance suite (JVM, ModelRenderer)
mindees-example-app/
  build.gradle.kts
  src/main/AndroidManifest.xml
  src/main/kotlin/dev/mindees/example/
    MainActivity.kt            # runnable Android app
    MindeesRuntimeBridge.kt    # JSON command bridge + QuickJS runtime adapter
  src/androidTest/kotlin/dev/mindees/example/
    MindeesExampleInstrumentedTest.kt
  src/test/kotlin/dev/mindees/example/
    MindeesRuntimeBridgeTest.kt
```

## Build + test (JVM unit tests — no device needed)

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

The connected test launches `MainActivity` on Android, finds the native counter
label and button, clicks the button with `performClick()`, and asserts the
QuickJS bridge updates the live `TextView` to `Count: 1`.

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
- Native `press` events call back through `dispatchEvent(handlerId)`, which invokes
  the JavaScript app's `MindeesApp.dispatchEvent(handlerId)`.

The bundled app is a small counter. It renders native Android `TextView`/`Button`
instances, and pressing the native button updates the label through the same JSON
command protocol used by `@mindees/renderer`.

## Status

- ✅ **Phase 8D** — implements the 8B conformance contract; CI compiles the library
  (incl. `AndroidViewRenderer`) and runs `:mindees-host:test`.
- ✅ **Phase 8E** — `AndroidRenderTest` (Robolectric) renders a command stream into
  real `android.view` widgets, asserts the hierarchy + updates + disposal, and
  verifies click dispatch via `performClick()`.
- 🧪 **Phase 8F-A/B** — Android example app with an embedded QuickJS runtime and a
  real JS↔native command bridge. CI unit-tests the bridge contract, assembles the
  APK, and runs an emulator-connected smoke test against the live Activity.
  Physical-device execution remains future Phase 8F work.
- The tag→view mapping and prop application are an intentional MVP — extend
  `AndroidViewRenderer` for a real design system.
