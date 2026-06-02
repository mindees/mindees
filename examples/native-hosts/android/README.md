# MindeesNativeHost — Android reference host (Gradle)

> ⚠️ **Authored — pending verification.** This is a real Gradle/Android library, but
> it has **not** been built or run by the MindeesNative maintainers: there is no
> Android SDK/Gradle in the project's dev or CI environment. Open it in Android
> Studio (which provides Gradle + the wrapper), build/run it, and report what needs
> fixing. **Align the AGP/Kotlin/SDK versions** in `settings.gradle.kts` and
> `mindees-host/build.gradle.kts` with your installed toolchain if Gradle complains.
> It is **not** claimed to work until someone compiles + runs it.

A reference Android host that replays the MindeesNative **native command stream**
(from `@mindees/renderer`'s `createNativeCommandBackend()`) into `android.view`
widgets. It implements the exact contract that `@mindees/renderer`'s
`createReferenceHost()` specifies and tests (Phase 8B).

## Layout

```
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

- ✅ Implements the Phase 8B conformance contract (decode → apply → strict validate).
- 🔬 **Phase 8D** = a *verified*, runnable Android host (this library compiled + run
  on a device, wired to a real JS↔native bridge). The bridge transport is out of scope.
- The tag→view mapping and prop application are an intentional MVP — extend
  `AndroidViewRenderer` for a real design system.
