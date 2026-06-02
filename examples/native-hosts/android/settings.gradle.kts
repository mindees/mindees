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
        id("com.android.library") version "8.5.2"
        id("org.jetbrains.kotlin.android") version "1.9.24"
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
