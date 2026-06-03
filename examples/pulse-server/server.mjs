// Runnable node:http adapter for the Pulse reference update server.
//
// The pure selection / rollout / anti-downgrade / freeze logic lives in
// @mindees/updates/server (`createUpdateServer`) and is unit-tested there; this file
// is ONLY the I/O wiring — exactly the boundary the doctrine asks for. In a real
// deployment you would back the store with a database + object store and publish
// pre-signed manifests from your OFFLINE release pipeline (the server never signs).
//
// Run: pnpm --filter @mindees/updates build && pnpm --filter @mindees/example-pulse-server start

import { createServer } from 'node:http'
import { generateKeypair, sha256Hex, signManifest, toHex, utf8 } from '@mindees/updates'
import { createMemoryUpdateServerStore, createUpdateServer } from '@mindees/updates/server'

// --- offline release step (done on a trusted machine, not on the server) ----------
// Generate a signing key and sign one release. Only the PUBLIC key is embedded in the
// app; the secret key never reaches the server.
const { secretKey, publicKey } = generateKeypair()
const bundle = utf8('console.log("hello from MindeesNative OTA v2")')
const bundleSha = sha256Hex(bundle)
const manifest = {
  schema: 1,
  id: 'release-2',
  version: 2,
  runtimeVersion: '1.0.0',
  createdAt: new Date().toISOString(),
  launchAsset: { path: 'index.js', size: bundle.length, sha256: bundleSha },
  assets: [],
}
const signed = signManifest(manifest, [{ keyId: 'release-key', secretKey }])

// --- the server holds only PRE-SIGNED artifacts -----------------------------------
const store = createMemoryUpdateServerStore()
store.publish({ signed }) // stable channel, 100% rollout by default
store.putAsset(bundleSha, bundle)
const updates = createUpdateServer({ store })

const PORT = Number(process.env.PORT ?? 4000)

const httpServer = createServer((req, res) => {
  void handle(req, res).catch((err) => {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: String(err) }))
  })
})

/** Route one request to the update-resolution or asset-serving endpoint. */
async function handle(req, res) {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

  // GET /api/updates?runtimeVersion=&channel=&currentVersion=&rolloutKey=
  if (req.method === 'GET' && url.pathname === '/api/updates') {
    const rawVersion = url.searchParams.get('currentVersion')
    if (rawVersion !== null && !/^\d+$/.test(rawVersion)) {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'currentVersion must be a non-negative integer' }))
      return
    }
    const resolution = await updates.resolveUpdate({
      runtimeVersion: url.searchParams.get('runtimeVersion') ?? '',
      channel: url.searchParams.get('channel') ?? undefined,
      currentVersion: rawVersion === null ? 0 : Number(rawVersion),
      rolloutKey: url.searchParams.get('rolloutKey') ?? undefined,
    })
    // A per-device decision — never let an intermediary cache it.
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(resolution))
    return
  }

  // GET /api/assets/<sha256>  (delta blobs are ordinary content-addressed assets)
  if (req.method === 'GET' && url.pathname.startsWith('/api/assets/')) {
    const bytes = await updates.getAsset(url.pathname.slice('/api/assets/'.length))
    if (!bytes) {
      res.writeHead(404)
      res.end()
      return
    }
    // Content-addressed → immutable, cache forever.
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
    })
    res.end(Buffer.from(bytes))
    return
  }

  res.writeHead(404)
  res.end()
}

httpServer.listen(PORT, () => {
  console.log(`Pulse reference update server: http://localhost:${PORT}`)
  console.log(`  GET /api/updates?runtimeVersion=1.0.0&currentVersion=1`)
  console.log(`  GET /api/assets/${bundleSha}`)
  console.log(`Embed this trusted public key in your app: ${toHex(publicKey)}`)
})
