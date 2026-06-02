# ADR-0006: Native renderer foundation — a platform-neutral command backend (Phase 8A)

- **Status:** Accepted
- **Date:** 2026-06-02

## Context

MindeesNative's defining promise is a **native strand** (framework spec §6.2):
real UIKit/SwiftUI (iOS) and Jetpack Compose/View (Android) host nodes, so apps
look genuinely native and adopt new OS design languages the day they ship — the
exact thing Flutter's painted-replica UI cannot do, while keeping the developer
in TypeScript. Until now the only working render targets were web/DOM and the
headless backend; the `NativeBackend` interface existed but threw
`NotImplementedError`. Native rendering is the missing, framework-defining piece.

A full iOS/Android renderer is a multi-phase effort. The question for **Phase 8A**
is: what is the smallest, real, testable step that moves us from "web renderer
only" toward native rendering — without faking it?

## Decision

Introduce a **platform-neutral native command protocol** and a **command-stream
backend** that implements the existing Helix `HostBackend<N>` contract.

The reconciler already speaks only `HostBackend<N>` (create/insert/setProp/
setText/remove/parentOf/nextSibling/isText). So instead of mutating a DOM, the new
backend records each operation as a serializable
[`NativeCommand`](../../packages/renderer/src/native-protocol.ts): `createNode`,
`createText`, `setProp`, `removeProp`, `insertChild` (with an explicit index),
`removeChild`, `updateText`, `disposeNode`, and `registerEvent` /
`unregisterEvent`. A native host replays this stream against real platform views.

Key decisions:

1. **Command stream first, host second.** The protocol is the contract a real host
   (8B/8C) will implement. Shipping it now makes the architecture real and
   testable in Node — fine-grained reactive updates produce a correct, minimal
   command stream — *before* committing to any platform's view system. The
   command stream is also the natural seam for future OTA (server-driven UI) and
   for a remote/inspector debugger.

2. **Serializable, no functions on the wire.** `NativePropValue` is restricted to
   JSON-safe values (primitives, `null`, arrays, plain objects). Event handlers
   are **never** serialized: an `onX` prop becomes a `registerEvent` carrying a
   stable `handlerId`; the host calls `dispatchEvent(handlerId, event)` back into
   the runtime when the native event fires. This keeps closures on the JS side and
   lets the stream cross a real process/bridge boundary unchanged.

3. **Content-addressed-free, index-based tree ops.** `insertChild` carries an
   explicit `index` (computed by the backend from the `HostBackend` anchor model),
   and removal detaches a node (`removeChild`) then disposes it **and every
   descendant** (`disposeNode`, deepest-first), unregistering handlers — so a
   correct host never leaks nodes or handlers. This matches how native view
   removal cascades.

4. **Honest `native.ts`.** `createNativeCommandBackend()` is implemented and
   tested. `createNativeBackend('ios'|'android')` and `createCanvasBackend()`
   remain research tracks that throw `NotImplementedError`; their docs now point to
   the command backend as the working MVP and to the reference host stubs.

5. **Reference host stubs, clearly marked.** `examples/native-hosts/` contains a
   Swift and a Kotlin host sketch showing the command→view mapping. They are
   illustrative, not compiled in CI, and documented as not-yet-runnable.

## Why not the obvious alternatives

- **Why not React Native / Expo / Capacitor / a WebView?** MindeesNative must be
  its own framework with its own renderer (the entire thesis is escaping RN's and
  Flutter's architectural trade-offs). Wrapping RN or a WebView would inherit
  exactly the single-JS-thread / dependency-hell / non-native problems we exist to
  fix. The command backend is the foundation for *our* native renderer.

- **Why a command stream instead of a direct in-process native binding now?** A
  direct binding requires committing to a platform view system and shipping
  compiled native code before the protocol is proven. The command stream is
  testable in pure Node, decouples the reconciler from any platform, and is the
  same shape a host needs whether it runs in-process or across a bridge.

## Consequences

- `@mindees/renderer` ships a **working native command backend** today: render any
  app against it and get a deterministic, serializable command stream. This is the
  native-rendering *path*, end to end on the JS side.
- It is **not** an iOS/Android renderer: nothing draws to a screen yet. A real
  host that materializes the stream is Phase 8B (iOS) / 8C (Android); an
  end-to-end native example is 8D. STATUS.md and the package README say so plainly.
- The web/DOM, headless, and SSR behavior of `@mindees/renderer` is unchanged; the
  command backend is purely additive (a new `HostBackend` implementation).
- No new runtime dependencies. The backend reuses the renderer's existing
  `isEventProp` and the reconciler unchanged.

## Limitations & future path

- Props/accessibility mapping is intentionally minimal (the protocol carries the
  values; mapping them to platform attributes is host work in 8B/8C).
- Batching is host-pulled (`flushCommands()`); wiring it to the core scheduler's
  flush for automatic per-tick batches is a possible follow-up.
- The reference hosts do not handle layout, styling, or lifecycle beyond the
  illustrated mappings.
- **Next:** Phase 8B (a compiled iOS host MVP that renders the command stream with
  UIKit/SwiftUI) is the recommended next step — lower-risk than Android because
  the SwiftUI/UIKit value-tree maps cleanly to create/insert/dispose, and a single
  reference surface (one `UIWindow`) is enough to prove end-to-end rendering.
