// ⚠️ Authored, not yet built by the maintainers (no Android SDK in dev/CI).
// Open in Android Studio (it provides Gradle + the wrapper) or run with a local
// Gradle. Align the plugin/SDK versions below with your installed toolchain.

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
    plugins {
        // Latest stable as of June 2026. Align with your installed Android Studio /
        // Gradle if it complains (AGP 9.x needs JDK 17+ and a recent Gradle).
        id("com.android.library") version "9.2.0"
        id("org.jetbrains.kotlin.android") version "2.3.20"
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
