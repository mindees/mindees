# examples/ — Runnable example apps

This directory holds **runnable** examples that exercise the framework.

**Status: partial.** Several runnable, CI-tested examples already exist:

- [`pulse-server`](./pulse-server/) — a reference Pulse OTA update server (`node:http`).
- [`data-sync-server`](./data-sync-server/) — a reference Continuum sync server (`node:http`).
- [`native-hosts/`](./native-hosts/) — the iOS (JavaScriptCore) and Android (QuickJS) reference
  hosts. Android ships a runnable embedded-QuickJS example app exercised on a real **Android
  emulator** in CI ([`native-android.yml`](../.github/workflows/native-android.yml)); iOS has an
  embedded JavaScriptCore bridge that renders the same app shape and is smoke-tested on a real
  **iOS Simulator** in CI ([`native-ios.yml`](../.github/workflows/native-ios.yml)). The same
  TypeScript counter is interactive on both — native events carry their values back into the
  runtime (e.g. a button tap dispatches through `dispatchEvent`). No local Mac is needed; both
  platforms are CI-verified. Physical-device proof is still pending — see the
  [native-hosts README](./native-hosts/README.md) for the exact status.

Still **planned**: a cross-platform flagship app (e.g. a podcast app with offline downloads,
demonstrating routing + offline data + a live signed OTA update) and a first-class runnable **web**
example (deferred under Phase 13 — see [`ROADMAP.md`](../ROADMAP.md)).

Adding a tiny example here is a great [`good first issue`](https://github.com/mindees/mindees/labels/good%20first%20issue).
