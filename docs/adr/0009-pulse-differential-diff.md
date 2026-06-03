# ADR-0009: Pulse (Phase 9B) — differential bundle diffing (zero-dep rolling-hash delta)

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

Phase 9A's content-addressed store already avoids re-downloading **unchanged files**
(blobs are keyed by SHA-256). But the common OTA case is a **changed** file — a 3 MB
JS bundle edited by a few KB still re-downloads in full, because its hash changed.
Phase 9B adds **byte-level differential download**: ship only the delta between the
old and new bytes of a changed asset.

This is the first of three Pulse-**delivery** sub-phases (9B diff → 9C reference
server → 9D SDUI), each its own PR. The doctrine is strict: pure TypeScript, no
native binaries or WASM, must run on Node/browsers/**Hermes/RN**, headlessly
testable, minimal dependencies, and it must not weaken the 9A trust model.

Prior art (live-verified): `fossil-delta` (the SQLite/Fossil rolling-hash COPY/INSERT
delta — pure-JS, same algorithm class we'd hand-roll), `@ably/vcdiff-decoder` (pure-JS
**decode-only**, pairs with a **native** xdelta3 encoder), bsdiff (native or abandoned
non-Hermes JS stubs), `diff-match-patch`/`fast-myers-diff` (text/edit-script, wrong
model for binary). bsdiff's ratio win is mainly on recompiled machine code; our
payloads are JS bundles + assets where a rolling-hash COPY/INSERT delta is near-optimal.

## Decision

**Hand-roll a small, zero-dependency, pure-TS rolling-hash delta** in
`@mindees/updates` (`src/delta.ts`). No runtime dependency (we vendor ~200 LOC we
own and version, as with the Standard Schema types). The workload is asymmetric, so
the design is too:

### Wire format (deterministic, content-addressable)
`[version:1 byte][targetLength:varint][ op* ]` where each op is a varint tag whose
low bit selects the kind:
- **COPY** = `varint(len*2 + 0)` then `varint(zigzag(offset − expected))` — `expected`
  is the base offset right after the previous copy, so sequential copies encode as a
  tiny zig-zag `0`.
- **INSERT** = `varint(len*2 + 1)` then `len` raw bytes.

Varints are unsigned LEB128 computed with `%`/`Math.floor` (53-bit safe, not 32-bit
bit-ops), so multi-MB files are handled correctly. `diff()` output is deterministic
(stable index iteration), so delta blobs are themselves reproducibly content-addressed.

### `diff(base, target)` — build/server-side (slowness acceptable)
Rabin-Karp index of fixed **64-byte** non-overlapping base blocks → `Map<hash,
offsets[]>`. Scan the target with a rolling hash; on a hash hit, **confirm the raw
bytes before emitting a COPY** (the hash may collide — never trusted), then greedily
extend the match right and left (left-extension reclaims bytes from the pending
INSERT run). The 64-byte block is itself the minimum match, so a COPY always pays for
its overhead.

### `applyDelta(base, delta)` — the only on-device piece
A tight loop into a pre-sized output buffer: read a tag, emit `base[off..]` (COPY) or
raw bytes (INSERT). No decompressor → byte-identical on Node/browser/Hermes. Treats
the delta as **fully untrusted**: every COPY offset/length is bounds-checked against
the base, every write against the declared target length, and the target length
against a configurable `maxBytes` cap (anti-decompression-bomb). Any violation throws
`UpdateError('DELTA_INVALID')`.

### Integration — a pure optimization layer under the existing trust gate
`AssetEntry` gains an optional `patch?: { base: <sha256>; delta: AssetEntry }`
descriptor. It lives **inside the signed manifest**, so it is covered by the single
Ed25519 signature. In `download()`, for each asset:
1. `hasBlob(asset.sha256)` → skip (existing content-addressed dedup, untouched).
2. else if `patch` present **and** `hasBlob(patch.base)` → fetch the small delta blob,
   verify the **delta blob's own** SHA-256, `applyDelta(base, delta)`, then run the
   **existing `sha256Hex(result) === asset.sha256` gate** before `writeBlob`.
3. on any failure (missing base, bad delta, `DELTA_INVALID`, hash mismatch) → fall
   back to a normal full fetch.

The decisive guarantee is the **post-apply SHA-256 check that already exists**: a
bad or forged delta at worst wastes CPU and then falls back — it can never install
unverified bytes. The trust model from 9A is unchanged; diff is purely an
optimization.

## Consequences
- A localized edit in a multi-MB bundle ships as ~KB, beyond 9A's file-level dedup.
- Zero new runtime dependencies (`fast-check` added as a **devDependency** for
  round-trip property tests). `diff()` is tree-shaken out of device bundles
  (`sideEffects:false`); only `applyDelta` is on the device path.
- New error code `DELTA_INVALID`. `AssetEntry.patch` is additive and optional, so
  existing manifests are byte-for-byte unchanged (canonical serialization omits it).
- `applyDelta` is in the boot/security path, so it is gated by deterministic
  edge-case tests **and** `fast-check` property tests asserting
  `applyDelta(base, diff(base, target)) === target` over random + structurally-mutated
  inputs, plus the SHA-256 gate.

## Alternatives considered
- **`fossil-delta`** — same algorithm class; buys convenience, not ratio, at the cost
  of a 2014-rooted dep and an on-the-wire format we don't control. Vendoring is more
  doctrine-aligned.
- **`@ably/vcdiff-decoder` + native xdelta3** — best ratio on recompiled native
  binaries, but drags a **native encoder into CI** and breaks headless round-trip
  testing of `diff()`. Deferred to a research track; revisit only if telemetry shows
  we ship native blobs where the ratio materially wins.
- **bsdiff (JS)** — disqualified: maintained build is native (won't run on Hermes);
  the "pure-JS" packages are abandoned and browser/Hermes-hostile.
- **`diff-match-patch` / `fast-myers-diff`** — wrong model (UTF-16 text / LCS
  edit-scripts), poor ratio + apply ergonomics for multi-MB binary, no clean
  content-addressed reconstruction.

## Deferred (research track)
A server-side `getDelta(fromSha, toSha)` endpoint and the patch-planner that *emits*
manifests with `patch` descriptors land with the reference server (9C); the
`AssetEntry.patch` shape and `applyDelta` are designed to make that additive.
VCDIFF-grade ratio stays a research track.
