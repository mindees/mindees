// CI-verified through .github/workflows/native-android.yml. Open in Android
// Studio (it provides Gradle + the wrapper) or run with a local Gradle. Align
// the plugin/SDK versions below with your installed toolchain if needed.

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
    plugins {
        // Latest stable as of June 2026. AGP 9 has BUILT-IN Kotlin support, so the
        // org.jetbrains.kotlin.android plugin is no longer applied (AGP errors if it
        // is). Align AGP with your toolchain if Gradle complains (AGP 9.x needs
        // JDK 17+ and a recent Gradle).
        id("com.android.application") version "9.2.0"
        id("com.android.library") version "9.2.0"
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "mindees-native-host-android"
include(":mindees-host")
include(":mindees-example-app")
