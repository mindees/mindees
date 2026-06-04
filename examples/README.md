# examples/ — Runnable example apps

This directory holds **runnable** examples that exercise the framework.

**Status: partial.** Several runnable, CI-tested examples already exist:

- [`pulse-server`](./pulse-server/) — a reference Pulse OTA update server (`node:http`).
- [`data-sync-server`](./data-sync-server/) — a reference Continuum sync server (`node:http`).
- [`native-hosts/`](./native-hosts/) — the iOS (JavaScriptCore) and Android (QuickJS) reference
  hosts, including a runnable Android example app exercised on an emulator in CI.

Still **planned**: a cross-platform flagship app (e.g. a podcast app with offline downloads,
demonstrating routing + offline data + a live signed OTA update) and a first-class runnable **web**
example (deferred under Phase 13 — see [`ROADMAP.md`](../ROADMAP.md)).

Adding a tiny example here is a great [`good first issue`](https://github.com/mindees/mindees/labels/good%20first%20issue).
