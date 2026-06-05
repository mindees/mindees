---
"@mindees/renderer": minor
---

**`createNativeApp` now makes animations + concurrency work by default on a native host** (P2 toward
RN/Flutter parity). On a host it installs a reactive scheduler (so `startTransition`/`deferred`/
normal-lane effects run) and a vsync-driven frame source (so `timing`/`spring`/gesture animations and
stack-navigator transitions actually advance). The host drives frames by calling the new
`MindeesApp.frameTick(nowMs)` each vsync; the engine signals when to run/stop that loop via a
`MindeesHostFrame.setFrameLoopActive(boolean)` global — so the loop runs **only while something is
animating** (battery-friendly), tied to the animation engine's own arm/sleep. Deferred/normal-lane
tree mutations reach the host via a coalesced trailing flush (one frame late, never dropped).

Opt-out + safe by default: with no host (SSR / Node / tests) nothing is installed and animations jump
to their final value exactly as before — the existing behavior and tests are unchanged. New
`scheduler` / `wireEngines` options on `createNativeApp` for full control.
