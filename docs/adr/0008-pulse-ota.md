# ADR-0008: Pulse (Phase 9) — signed OTA core: manifests, Ed25519 signing, content-addressed store, atomic rollback

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

Phase 9 ships `@mindees/updates` (**Pulse**) — over-the-air updates: ship new
JavaScript + assets to installed apps without an app-store release. The ROADMAP
scopes signed differential OTA + SDUI; this ADR covers the **core an app embeds**
(manifest, signing, storage, atomic apply + rollback, the client flow). Differential
bundle diffing, a reference server, and SDUI build on this core (a follow-up PR);
the WASM module runtime is a research track.

Grounded in current prior art (live-verified): Expo Updates protocol v1 (a signed
manifest enumerating assets by SHA-256; a `runtimeVersion` compatibility gate;
apply-on-next-launch; error-recovery rollback to last-good then embedded),
CodePush's readiness-handshake auto-rollback, and The Update Framework's
rollback/freeze protections (monotonic version, expiry, threshold-signed trust).

Doctrine constraints: everything shipped must actually work; **no native binaries**;
must run cross-platform incl. React Native/Hermes, where WebCrypto Ed25519 is absent.

## Decision

### 1. Signed manifest (the protocol contract)
An `UpdateManifest` is a versioned JSON document enumerating the bundle's files by
content hash (`{ schema, id, version, runtimeVersion, createdAt, expires?,
launchAsset, assets[], metadata? }`, each asset `{ path, size, sha256 }`). One
signature over the manifest transitively secures every file: verify the signature,
then verify each downloaded blob's SHA-256.

A `SignedManifest` carries the **exact canonical JSON bytes that were signed** plus
the signatures, so the verifier checks the signature over the *received bytes* and
never re-serializes (sidestepping JSON-canonicalization number footguns).
`canonicalManifestJson` still produces deterministic, key-sorted, integer-only bytes
so signing is reproducible.

### 2. Signing & verification (minimal TUF subset)
- **Ed25519** via pure-JS `@noble/curves` + `@noble/hashes` — runs on Node,
  browsers, and Hermes/RN; no native module, no `crypto.subtle` dependency.
- **Trust:** the app embeds `TrustedKey { keyId, publicKey }` set + a `threshold`
  (default 1). Verification needs `≥ threshold` valid signatures from **distinct**
  trusted keys → enables **key rotation** (trust old + new) and multi-party signing.
- **Rollback protection:** the client persists the highest version ever applied and
  rejects any manifest not strictly newer.
- **Freeze protection:** a past `expires` is rejected (`MANIFEST_EXPIRED`).
- **Compatibility gate:** a `runtimeVersion` mismatch is reported as not-available —
  the structural guarantee that OTA never carries native changes (Apple §3.3.2).

### 3. Content-addressed storage (injected capability)
`UpdateStorage` (blobs by SHA-256 + a small state doc) is injected (like the CLI's
`FileSystem`) → deterministic in tests, backend-agnostic (FS/S3/R2/RN). Blobs keyed
by hash ⇒ identical files across updates store once, and **only changed hashes are
downloaded** — differential download falls out of content-addressing for free, with
no binary-diff format. `createMemoryStorage()` is the reference implementation.

### 4. Atomic generations + rollback state machine
An update applies as a **generation** with an atomic pointer flip; the previous good
generation and the embedded build are always retained. State:
`{ current, previous, highestVersion, pendingVerification, bootAttempts, generations }`.

- **check** → fetch + verify the signed manifest; apply the signature/expiry/runtime/
  monotonic gates.
- **download** → fetch only unstored assets, verify each blob's hash, record a
  `pending` generation (never touches the live one).
- **apply** → verify all assets present, then flip (`previous = current`,
  `current = id`, `pendingVerification = true`, bump `highestVersion`).
- **boot** → if `current` is unconfirmed, increment `bootAttempts`; past
  `maxBootAttempts` (default 1) the generation is presumed crash-looping → revert to
  `previous`, else the **embedded** build (`isEmergencyLaunch`).
- **notifyReady** → the app calls this once launched successfully; confirms `current`.

### 5. Research track
The **WASM module runtime** throws `NotImplementedError` (documented research track).

## Consequences
- The app integrates Pulse by providing storage, trusted keys, the runtime version,
  fetch callbacks, and an embedded baseline; the core handles verify → download →
  atomic apply → crash-rollback. Pure-TS + injected capabilities ⇒ the whole flow
  runs headless in CI (no DOM, no network, no native module).
- Security addressed: tamper (signature + per-file hash), rollback (monotonic
  version), freeze (expiry), mix-and-match (manifest enumerates the exact set),
  compromised CDN (end-to-end signatures — the CDN never holds a private key).
- **Deferred to the Pulse delivery PR:** differential bundle diffing (pure-JS
  `fossil-delta`), a reference update server, and SDUI. The core is useful without
  them (content-addressing already avoids re-downloading unchanged assets).

## Alternatives considered
- **WebCrypto / Node `crypto` for on-device verify** — rejected: Ed25519 in
  `crypto.subtle` is unavailable on Hermes/RN; pure-JS `@noble` runs everywhere.
- **Sign each file** — rejected: one canonical manifest of hashes is cheaper with
  the same integrity guarantee.
- **Re-serialize for verification** — rejected for detached canonical bytes (avoids
  number-canonicalization edge cases).
- **Binary diff in the core** — deferred; content-addressing already skips unchanged
  assets, so the core flow is useful first.
