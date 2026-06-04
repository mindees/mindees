---
"@mindees/core": minor
"@mindees/compiler": minor
"@mindees/cli": minor
"@mindees/router": minor
"@mindees/renderer": minor
"@mindees/ai": minor
"@mindees/data": minor
"@mindees/updates": minor
"@mindees/atlas": minor
"create-mindees": minor
---

First public release — **v0.1.0**.

MindeesNative's foundation is complete and audited: fine-grained reactivity, the
component model + selector-isolated context, the priority scheduler and thread-pool
abstraction (`@mindees/core`); the Helix renderer with web/DOM + headless backends,
SSR/hydration, and a CI-verified native strand on iOS (JavaScriptCore) and Android
(QuickJS) (`@mindees/renderer` + `examples/native-hosts`); the build-time optimizer
(`@mindees/compiler`); the Forge CLI + `create-mindees` scaffolder; the Quantum typed
router with data loaders, guards, and view transitions (`@mindees/router`); the Pulse
signed-OTA + SDUI system (`@mindees/updates`); the Continuum local-first CRDT store +
sync engine (`@mindees/data`); the Synapse AI gateway (`@mindees/ai`); and the Atlas
accessible primitives + virtualized list (`@mindees/atlas`).

APIs are 🧪 experimental (pre-1.0); see `STATUS.md`. This `minor` bump versions the
whole locked `@mindees/*` line at `0.1.0`.
