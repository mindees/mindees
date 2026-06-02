// ⚠️ Authored, not yet built by the maintainers (no Android SDK in dev/CI).
// Align compileSdk / Java / plugin versions with your installed toolchain if needed.

plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
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

    kotlinOptions {
        jvmTarget = "17"
    }

    testOptions {
        unitTests {
            // The host + ModelRenderer are pure Kotlin; JSON-codec tests use the real
            // org.json (added below). Defaults keep any stray android stub call quiet.
            isReturnDefaultValues = true
        }
    }
}

dependencies {
    testImplementation(kotlin("test"))
    testImplementation("org.json:json:20231013") // real org.json for codec unit tests
}
