# ADR-0010: Pulse (Phase 9C) — reference update server (pure injected core + thin adapter)

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

Phase 9A shipped the client an app embeds; 9B added differential download. Phase 9C
adds the other side of the wire: a **reference update server** the client talks to.
It must respect the same doctrine — pure TypeScript, headlessly testable, minimal
deps — and, critically, it must **never weaken the trust model**: signing is an
**offline** build step (9A), so the server only ever serves **pre-signed** manifests
and holds no private key.

Prior art (live-verified): Expo Updates server protocol v1 (client sends
`runtimeVersion`/`currentVersion`; server returns a newer manifest, "no update", or a
roll-back directive), CodePush/Capgo/hot-updater (DB + object store + stats — the
shape of an eventual hosted product, not a reference core).

## Decision

### A pure, capability-injected core (`src/server.ts`, exported as `@mindees/updates/server`)
`createUpdateServer({ store, now })` is a pure function of an injected
`UpdateServerStore` (release list + asset bytes + optional rollback directives) and a
clock — so all selection logic is deterministic and unit-testable with no network and
no native I/O. It is exported from a **`./server` subpath**, never from the device `.`
entry, so the client bundle never pulls server code. A thin `node:http` adapter lives
in `examples/pulse-server/` and is the *only* Node-specific piece.

The server **never signs** — `UpdateServerStore` holds only pre-signed
`SignedManifest` objects, enforced structurally (no `Signer` in its capability set).
It returns the client's exact `fetchManifest` shape (`SignedManifest`) verbatim.

### `resolveUpdate(query)` → `update | no-update | roll-back-to-embedded`
Given `{ runtimeVersion, channel='stable', currentVersion=0, rolloutKey? }`:
1. **Rollback directive** — if an operator has posted a `RollbackDirective` for the
   channel applying to `currentVersion`, return `roll-back-to-embedded`.
2. **Best eligible release** — among published releases on the channel: parse each
   signed manifest, require `runtimeVersion` to match, require `version >
   currentVersion` — where `currentVersion` is the client's **anti-downgrade floor /
   high-water mark** (`state().highestVersion`), so the server never advertises what
   the client would reject at `check()` — drop expired manifests (**freeze**), and
   require **rollout eligibility**; return the highest-version survivor (ties broken by
   `id` so selection is independent of store order), else `no-update`. A
   non-integer/negative `currentVersion` is treated as 0 (fail closed), so a degenerate
   query can never silently disable the gate.

The rollback directive is an **emergency stop** that takes precedence over release
selection; to ship a forward fix, the operator clears the directive (a
version-bounded directive that coexists with a forward fix is a future extension).

### Deterministic staged rollout
`eligible = rollout >= 100 || (rolloutKey && bucket(manifestId, rolloutKey) < rollout)`,
where `bucket = (uint32(sha256(`${manifestId}:${rolloutKey}`)[0..4]) / 2^32) * 100`.
Bucketing on `(manifestId, rolloutKey)` — **never `now()`/`Math.random`** — keeps a
device in a stable cohort across polls. A partial rollout (`< 100`) requires a
`rolloutKey`; without one only fully-rolled-out releases are offered (no random
assignment).

### Asset serving
`getAsset(sha256)` validates a lowercase 64-hex address before lookup and returns the
bytes (or `null`). Delta blobs (9B) are ordinary content-addressed assets, served the
same way.

## Consequences
- The selection/rollout/anti-downgrade/freeze logic is pure and fully tested with an
  in-memory store (`createMemoryUpdateServerStore`); the example adapter is just I/O.
- Zero new dependencies. The server core is pure TS (reuses `parseManifest`,
  `sha256Hex`, `utf8`), `import type`-only on `signing`, so the `./server` entry has no
  runtime coupling to signing and no `node:` imports.
- **Honest gap (deferred to a client follow-up):** the current client's
  `fetchManifest` returns only a `SignedManifest`, so it consumes the **`update`** case
  directly; teaching `check()` to also consume `no-update` / `roll-back-to-embedded`
  directives is a client-protocol extension. The server returns all three and is
  tested for them now; the directive path is inert on the client until then. This is
  documented, not hidden.

## Alternatives considered
- **Server signs on demand** — rejected: a key on the server is exactly the compromise
  the 9A trust model prevents. Signing stays offline.
- **Cloning Expo's multipart / structured-field-values transport** — over-built; the
  Pulse client consumes a plain `SignedManifest`. Cited as design reference only.
- **A fat hosted server (DB, S3/R2, stats, multipart)** — that's the eventual product,
  not a reference core. The injected `UpdateServerStore` already allows a persistent
  backend later without touching the core.
- **Static pre-rendered manifests** — a good *shipping mode* the same core can target
  (run selection at publish time), but it can't do server-side percentage rollout
  alone; kept as a deployment option, not the core.
