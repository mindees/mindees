# MindeesNativeHost — Android reference host (Gradle)

> ✅ **CI-verified: compiles + conformance core + renders via Robolectric.** A GitHub
> Actions Linux runner with the Android SDK
> ([`.github/workflows/native-android.yml`](../../../.github/workflows/native-android.yml))
> runs `:mindees-host:test` (incl. a **Robolectric** render test against real
> `android.view` widgets, with click dispatch via `performClick()`) and
> `:mindees-host:assembleDebug` (compiles `AndroidViewRenderer`) on every change —
> AGP 9.2 / Gradle 9.4.1 / JDK 17. What is **not** yet verified: a full app on a
> physical device over an embedded JS engine / JS↔native bridge (Phase 8F). To open
> locally, use Android Studio (it provides Gradle); align the AGP/SDK versions in
> `settings.gradle.kts` / `mindees-host/build.gradle.kts` with your toolchain if
> Gradle complains. Not a production host.

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
```

## Build + test (JVM unit tests — no device needed)

```sh
cd examples/native-hosts/android
./gradlew :mindees-host:test     # apply + strict validation + JSON-codec, on the JVM
./gradlew :mindees-host:assemble # compile the Android library (needs the SDK)
```

The host, `ModelRenderer`, and `NativeCommandCodec` are exercised by JVM unit
tests (no emulator). `AndroidViewRenderer` is the device-facing layer.

## Use it on a device

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

## Status

- ✅ **Phase 8D** — implements the 8B conformance contract; CI compiles the library
  (incl. `AndroidViewRenderer`) and runs `:mindees-host:test`.
- ✅ **Phase 8E** — `AndroidRenderTest` (Robolectric) renders a command stream into
  real `android.view` widgets, asserts the hierarchy + updates + disposal, and
  verifies click dispatch via `performClick()`.
- 🔬 **Phase 8F** — a full app on a physical device over an embedded JS engine /
  JS↔native bridge. Not done; the bridge transport is out of scope here.
- The tag→view mapping and prop application are an intentional MVP — extend
  `AndroidViewRenderer` for a real design system.
