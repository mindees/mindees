# ADR-0011: Pulse (Phase 9D) — server-driven UI (SDUI) subset

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

Phases 9A–9C ship signed OTA, differential download, and a reference server. Phase
9D (the last Pulse-delivery sub-phase) adds **server-driven UI**: ship UI as *data*
over OTA and render it through the framework's existing `@mindees/core`
`createElement` + signals. The headline risk is **injection** — untrusted JSON
becoming code or reaching an unintended host sink — so the design is allowlist-first
and never evaluates transported strings.

## Decision

A self-contained module `packages/updates/src/sdui.ts`, exported from the
**`@mindees/updates/sdui`** subpath (so OTA-only users tree-shake it away). It depends
only on `@mindees/core` (already a dependency) and **emits `MindeesNode`** — the
renderer is an *optional peer* the consumer mounts, not a dependency.

### A schema-versioned, allowlisted tree
An `SduiNode` is `{ schema: 1, tag, props?, children?, key? }`. `compileSdui(node,
registry)` validates **untrusted** input with the same fail-closed discipline as
`parseManifest` and compiles it to a `MindeesNode`:
- **Component allowlist** — `tag` must be a key of the injected
  `registry.components` (a host-tag string or a `Component`); an unknown tag is
  rejected. There is no denylist and no default passthrough.
- **Hard limits** — max depth, total node/value count (elements, string children,
  **and every nested prop/`args` value**), string length, and keys-per-object (all
  configurable), enforced in the single recursive pass, to bound a malicious or runaway
  payload. The child count is bounded before construction, and element construction is
  additionally wrapped so even a pathological config fails as `SduiError`, never an
  uncatchable `RangeError`.
- **Reserved structural props** — `key` and `children` are rejected as prop names;
  they flow only through the string-validated `node.key` and the node-validated
  `node.children` paths, so untrusted data can't set an arbitrary-typed element key or
  smuggle children past the pipeline.

### Named actions and data bindings — never code
- A prop whose **direct** value is `{ "$action": "name", "args"?: … }` compiles to a
  function that calls `registry.actions["name"](args, …event)`. An unknown action is
  rejected. **No function is ever transported or `eval`'d.**
- A prop whose **direct** value is `{ "$bind": "path" }` resolves via
  `registry.bindings(path)` — typically returning a `() => value` accessor, which the
  renderer already treats as a fine-grained reactive region. A `$bind` with no
  `bindings` provider is rejected.
- The `$action` / `$bind` markers are recognized **only** as a prop's direct value —
  never inside `args` or a nested plain object — so untrusted *data* can't promote
  itself to an action/bind reference.

### Prototype-pollution defense
Every object key (props, `args`, nested JSON, patch keys, JSON-Pointer segments) is
checked: `__proto__`, `constructor`, and `prototype` are **rejected** before any
object is built, and compiled props are assembled on a `null`-prototype object. (The
core `createElement` spreads props into a fresh object, but SDUI sanitizes first so a
poisoned key never reaches it.)

### Incremental updates — re-validated, not trusted
`applyMergePatch` (RFC 7396) and `applyJsonPatch` (a **safe RFC 6902 subset:
`add` / `remove` / `replace` only**) are pure, immutable, prototype-safe helpers that
patch the **JSON tree**. The contract: a patched tree must be re-run through
`compileSdui` before render, so a delta can never bypass the allowlist/limits.
`move` / `copy` / `test` and an expression/template language are **out of scope**
(deferred research track — an expression evaluator is the single largest injection
vector).

### Delivery
An SDUI tree is just a content-addressed asset under the existing Ed25519 + SHA-256
chain (9A) — no new trust surface. SDUI payloads **must** be delivered as signed
manifest assets; an out-of-band tree bypasses Pulse's trust and is unsupported.

## Consequences
- A secure, dependency-light SDUI v1: validated tree + named actions + reactive
  bindings + re-validated patches, all pure-TS and headlessly testable.
- No new third-party dependency (a tiny pure-TS merge-patch + safe JSON-Patch instead
  of `fast-json-patch`/`rfc6902`). `SduiError` carries a stable code, mirroring the
  package's `UpdateError` model.
- Errors fail closed: unknown tag/action, a missing binding, a limit breach, a
  dangerous key, or an unsupported patch op all throw rather than degrade.

## Alternatives considered
- **A standalone `@mindees/sdui` package** — deferred; keeping SDUI in `@mindees/updates`
  under a tree-shakeable subpath, with the renderer as an optional peer, avoids a
  premature package while still decoupling it from OTA-only use.
- **`fast-json-patch` / `rfc6902`** — rejected for v1: the full op set (`move`/`copy`/
  `test`, pointer edge-cases) is more surface than the subset needs from untrusted
  input; a ~focused pure-TS implementation we own is safer and dependency-free.
- **An expression/template language (`{{a+b}}`, `$if`/`$for`)** — rejected for v1:
  the largest injection vector; named components + actions + bindings cover the v1
  use cases without an evaluator.
