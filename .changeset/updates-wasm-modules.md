---
"@mindees/updates": minor
---

**Pulse sandboxed WASM modules are now implemented** (spec §10) — `createWasmModuleRuntime()` returns
a real runtime whose `instantiate(bytes, capabilities)` runs a signed feature module in its own linear
memory, reachable **only** through the capabilities you grant (capability-secure by construction — no
ambient JS/network/DOM access). Validates + size-caps modules (`MODULE_INVALID`). Core WebAssembly
(runs on Hermes/RN, Node, web); the full WASM Component Model (WASI 0.2/0.3) is a follow-up behind the
same `instantiate` seam. Previously a `NotImplementedError` research-track throw.
