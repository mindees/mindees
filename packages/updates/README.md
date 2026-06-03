# @mindees/updates

**Pulse** — signed over-the-air (OTA) updates: ship new JavaScript + assets to
installed apps without an app-store release, safely.

> Status: 🧪 **Experimental** (Phase 9A — the signed OTA core). The verify →
> download → atomic apply → crash-loop rollback flow is implemented and tested.
> Differential bundle diffing, a reference update server, and SDUI are the Phase 9B
> delivery follow-up. The WASM module runtime is a 🔬 research track
> (`createWasmModuleRuntime()` throws `NotImplementedError`). See the repository
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
