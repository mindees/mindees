---
"@mindees/cli": minor
---

The `android` template now derives a unique Android `applicationId` (`com.example.<app>`) and Gradle
`rootProject.name` from the app name, so two scaffolded MindeesNative Android apps install side-by-side
on a device (the compile `namespace` stays `dev.mindees.example` — Android keys install identity on
`applicationId`). Closes the documented namespace limitation.
