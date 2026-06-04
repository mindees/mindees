# @mindees/updates

**Pulse** — signed over-the-air (OTA) updates: ship new JavaScript + assets to
installed apps without an app-store release, safely.

> Status: 🧪 **Experimental** — Phase 9 (Pulse) is complete in its current scope.
> Implemented and tested: signed OTA core, differential bundle diffing, the reference
> update server, and server-driven UI (SDUI). The WASM module runtime is a 🔬 research
> track (`createWasmModuleRuntime()` throws `NotImplementedError`). See the repository
> [STATUS.md](../../STATUS.md).

## What works today

- **Hash-addressed manifest** — `UpdateManifest` enumerates a bundle's files, each by
  SHA-256. One signature over the manifest's canonical bytes transitively secures
  every file. `canonicalManifestJson` is deterministic (key-sorted, compact);
  `parseManifest` strictly validates untrusted input.
- **Ed25519 signing** — `signManifest` / `verifySignedManifest` over **detached
  canonical bytes** (the verifier never re-serializes). A `threshold` (default 1)
  requires that many valid signatures from **distinct** trusted keys → key rotation
  and multi-party signing. Pure-JS [`@noble`](https://github.com/paulmillr/noble-curves),
  so it runs on Node, browsers, and Hermes/React Native — no WebCrypto or native module.
- **Content-addressed storage** — `UpdateStorage` stores blobs by SHA-256, so files
  shared across updates are stored once and **unchanged assets are never re-downloaded**.
  `createMemoryStorage()` is the reference implementation; bring your own for FS/S3/R2/RN.
- **Differential (delta) downloads** — a zero-dependency, pure-TS byte-level delta codec
  (`diff` build-side, `applyDelta` on-device, a rolling-hash COPY/INSERT scheme). A
  changed asset can carry an `AssetEntry.patch` descriptor `{ base, delta }` in the
  signed manifest; the client fetches only the small delta, reconstructs the asset
  against a base blob it already holds, and verifies the result against the asset's
  SHA-256. A bad or forged delta can never install — it falls back to a full download.
- **Safe update client** — `createUpdateClient()`:
  - `check()` — fetch + verify the signed manifest; apply the signature, expiry,
    runtime-compatibility, and monotonic-version (anti-rollback) gates.
  - `download()` — fetch only assets not already stored, hash-verify each, record a
    `pending` generation (never touches the live one).
  - `apply()` — verify all assets present, then **atomically** flip the current
    generation (keeping `previous` + the embedded build as fallbacks).
  - `boot()` — on startup, roll back a generation that **crash-loops** before it
    confirms itself (readiness handshake), down to previous → embedded.
  - `notifyReady()` / `rollback()` — confirm a good launch, or revert manually.

## Reference update server

The `@mindees/updates/server` subpath ships a **pure, capability-injected**
`createUpdateServer` — the other side of the wire. It **never signs** (it serves
**pre-signed** manifests; signing stays offline) and is deterministic + headlessly
testable. `resolveUpdate({ runtimeVersion, channel, currentVersion, rolloutKey })`
does channel selection, **deterministic staged rollout**, an **anti-downgrade** mirror
of the client's own gate, **freeze** (expiry), and **rollback directives**; `getAsset`
serves content-addressed blobs (delta blobs included). A runnable `node:http` adapter
lives in [`examples/pulse-server/`](../../examples/pulse-server/). See
[ADR-0010](../../docs/adr/0010-pulse-reference-server.md).

## Server-driven UI (SDUI)

The `@mindees/updates/sdui` subpath ships UI **as data** over OTA. `compileSdui`
validates an untrusted, schema-versioned JSON tree against an injected **allowlist**
registry and compiles it to a `@mindees/core` `MindeesNode`:

- **named actions** — `{ "onPress": { "$action": "increment", "args": {…} } }` →
  a function calling a pre-registered handler (**no code is ever transported or `eval`'d**),
- **reactive bindings** — `{ "label": { "$bind": "count" } }` → a `() => value`
  accessor the renderer treats as a fine-grained reactive region,
- **fail-closed + safe** — unknown tags/actions, missing bindings, dangerous keys
  (`__proto__`/`constructor`/`prototype`), and depth/node/string/prop limit breaches all
  throw `SduiError`.

Incremental updates use a pure-TS RFC 7396 merge-patch (`applyMergePatch`) and a safe
RFC 6902 subset (`applyJsonPatch` — `add`/`remove`/`replace`); a patched tree must be
re-run through `compileSdui` before render. Design: [ADR-0011](../../docs/adr/0011-pulse-sdui.md).

## Quick start

```ts
import {
  createUpdateClient,
  createMemoryStorage,
  generateKeypair,
  signManifest,
  toHex,
} from '@mindees/updates'

// On your build server: sign a manifest (keep the secret key off-device).
const { secretKey, publicKey } = generateKeypair()
const signed = signManifest(manifest, [{ keyId: 'release-2026', secretKey }])

// In the app: embed the public key + the runtime version, then drive the flow.
const client = createUpdateClient({
  storage: createMemoryStorage(),
  trustedKeys: [{ keyId: 'release-2026', publicKey: toHex(publicKey) }],
  runtimeVersion: '1.0.0',
  embeddedVersion: 1,
  fetchManifest: async () => fetchJson('/updates/latest'),
  fetchAsset: async (asset) => fetchBytes(`/updates/assets/${asset.sha256}`),
})

await client.boot() // call once at startup, before rendering, to recover from a bad update
const result = await client.check()
if (result.available) {
  await client.download(result.manifest)
  await client.apply(result.manifest.id) // takes effect next launch
}
// …once the new version has launched and rendered successfully:
await client.notifyReady()
```

## Security model

A minimal subset of [The Update Framework](https://theupdateframework.io/) (TUF):

- **Tamper** — the manifest signature plus a per-file SHA-256 check.
- **Rollback / downgrade** — the client persists the highest version ever applied and
  rejects anything not strictly newer.
- **Freeze** — a past `expires` is rejected.
- **Mix-and-match** — the manifest enumerates the exact set of files.
- **Compromised CDN** — signatures are end-to-end; the CDN never holds a private key.
- **Native incompatibility** — a `runtimeVersion` mismatch is reported as not-available,
  so an OTA update can never carry native changes.

Design rationale: [ADR-0008](../../docs/adr/0008-pulse-ota.md).

## License

`MIT OR Apache-2.0`
