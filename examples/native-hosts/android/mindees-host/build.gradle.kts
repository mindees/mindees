// CI-verified by .github/workflows/native-android.yml. Align compileSdk / Java /
// plugin versions with your installed toolchain if needed.

plugins {
    // AGP 9 includes built-in Kotlin support — no separate kotlin-android plugin.
    id("com.android.library")
}

android {
    namespace = "dev.mindees.host"
    compileSdk = 36

    defaultConfig {
        minSdk = 24
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests {
            // The host + ModelRenderer are pure Kotlin; JSON-codec tests use the real
            // org.json (added below). Defaults keep any stray android stub call quiet.
            isReturnDefaultValues = true
            // Robolectric renders AndroidViewRenderer against real android.view on the JVM.
            isIncludeAndroidResources = true
        }
    }
}

// AGP's built-in Kotlin exposes the standard `kotlin {}` DSL.
kotlin {
    jvmToolchain(17)
}

dependencies {
    testImplementation("junit:junit:4.13.2") // JUnit 4 = AGP's default unit-test framework
    testImplementation("org.json:json:20231013") // real org.json for codec unit tests
    // Robolectric runs AndroidViewRenderer against real android.view classes on the JVM
    // (no emulator/device needed) so the render test runs in `./gradlew :mindees-host:test`.
    testImplementation("org.robolectric:robolectric:4.14.1")
}
