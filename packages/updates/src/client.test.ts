import { beforeEach, describe, expect, it } from 'vitest'
import { createUpdateClient, type UpdateClientOptions } from './client'
import { generateKeypair, sha256Hex, toHex, utf8 } from './crypto'
import { UpdateError } from './errors'
import type { AssetEntry, UpdateManifest } from './manifest'
import {
  type SignedManifest,
  type Signer,
  signManifest,
  type TrustedKey,
  type VerifiedManifest,
} from './signing'
import { createMemoryStorage, type UpdateStorage } from './store'

// One keypair the fixtures sign with and the client trusts.
let signer: Signer
let trusted: TrustedKey
beforeEach(() => {
  const { secretKey, publicKey } = generateKeypair()
  signer = { keyId: 'k1', secretKey }
  trusted = { keyId: 'k1', publicKey: toHex(publicKey) }
})

interface Fixture {
  signed: SignedManifest
  // Branded as verified: these fixtures are signed with the trusted key, so they
  // model exactly what `check()` would hand to `download()`.
  manifest: VerifiedManifest
  blobs: Map<string, Uint8Array>
}

function fixture(opts: {
  id: string
  version: number
  runtimeVersion?: string
  expires?: string
  assets?: Record<string, string>
  metadata?: Record<string, string>
}): Fixture {
  const assets = opts.assets ?? { 'index.js': `bundle-${opts.id}-${opts.version}` }
  const blobs = new Map<string, Uint8Array>()
  const entries: AssetEntry[] = Object.entries(assets).map(([path, content]) => {
    const b = utf8(content)
    blobs.set(path, b)
    return { path, size: b.length, sha256: sha256Hex(b) }
  })
  const [launchAsset, ...rest] = entries
  if (!launchAsset) throw new Error('fixture needs at least one asset')
  const manifest: UpdateManifest = {
    schema: 1,
    id: opts.id,
    version: opts.version,
    runtimeVersion: opts.runtimeVersion ?? '1.0.0',
    createdAt: '2026-06-03T00:00:00.000Z',
    ...(opts.expires ? { expires: opts.expires } : {}),
    launchAsset,
    assets: rest,
    ...(opts.metadata ? { metadata: opts.metadata } : {}),
  }
  return { signed: signManifest(manifest, [signer]), manifest: manifest as VerifiedManifest, blobs }
}

/** Download → apply → boot → notifyReady a fixture onto `storage`, leaving it confirmed-current. */
async function confirm(fx: Fixture, storage: UpdateStorage): Promise<void> {
  const c = client(fx, {}, storage)
  await c.download(fx.manifest)
  await c.apply(fx.manifest.id)
  await c.boot()
  await c.notifyReady()
}

function client(
  fx: Fixture,
  overrides: Partial<UpdateClientOptions> = {},
  storage: UpdateStorage = createMemoryStorage(),
) {
  return createUpdateClient({
    storage,
    trustedKeys: [trusted],
    runtimeVersion: '1.0.0',
    fetchManifest: () => Promise.resolve(fx.signed),
    fetchAsset: (asset) => Promise.resolve(fx.blobs.get(asset.path) ?? new Uint8Array()),
    now: () => Date.parse('2026-06-03T12:00:00.000Z'),
    ...overrides,
  })
}

describe('update client — check', () => {
  it('offers a newer, valid, compatible update', async () => {
    const fx = fixture({ id: 'u1', version: 2 })
    const result = await client(fx).check()
    expect(result.available).toBe(true)
    if (result.available) expect(result.manifest.id).toBe('u1')
  })

  it('reports up-to-date when the version is not newer than what is applied', async () => {
    const fx = fixture({ id: 'u1', version: 1 })
    const result = await client(fx, { embeddedVersion: 1 }).check()
    expect(result).toEqual({ available: false, reason: 'up-to-date' })
  })

  it('reports runtime-mismatch for an incompatible runtime version', async () => {
    const fx = fixture({ id: 'u1', version: 2, runtimeVersion: '2.0.0' })
    expect(await client(fx).check()).toEqual({ available: false, reason: 'runtime-mismatch' })
  })

  it('throws MANIFEST_EXPIRED for a stale manifest', async () => {
    const fx = fixture({ id: 'u1', version: 2, expires: '2026-06-03T06:00:00.000Z' }) // before `now`
    await expect(client(fx).check()).rejects.toBeInstanceOf(UpdateError)
  })

  it('throws SIGNATURE_INVALID for an untrusted signature', async () => {
    const fx = fixture({ id: 'u1', version: 2 })
    const other = generateKeypair()
    const c = client(fx, { trustedKeys: [{ keyId: 'k1', publicKey: toHex(other.publicKey) }] })
    await expect(c.check()).rejects.toBeInstanceOf(UpdateError)
  })
})

describe('update client — download', () => {
  it('downloads + hash-verifies assets and records a pending generation', async () => {
    const fx = fixture({ id: 'u1', version: 2 })
    const storage = createMemoryStorage()
    const c = client(fx, {}, storage)
    const gen = await c.download(fx.manifest)
    expect(gen).toMatchObject({ id: 'u1', version: 2, status: 'pending' })
    expect(await storage.hasBlob(fx.manifest.launchAsset.sha256)).toBe(true)
  })

  it('rejects an asset whose bytes do not match its hash (HASH_MISMATCH)', async () => {
    const fx = fixture({ id: 'u1', version: 2 })
    const c = client(fx, { fetchAsset: () => Promise.resolve(utf8('tampered')) })
    await expect(c.download(fx.manifest)).rejects.toBeInstanceOf(UpdateError)
  })

  it('is content-addressed: an already-stored blob is not re-fetched', async () => {
    const fx = fixture({ id: 'u1', version: 2 })
    let fetches = 0
    const c = client(
      fx,
      {
        fetchAsset: (asset) => {
          fetches++
          return Promise.resolve(fx.blobs.get(asset.path) ?? new Uint8Array())
        },
      },
      createMemoryStorage(),
    )
    await c.download(fx.manifest)
    await c.download(fx.manifest)
    expect(fetches).toBe(1) // second download skips the already-stored blob
  })
})

describe('update client — apply / boot / rollback', () => {
  it('applies a downloaded generation atomically (current + pending, version bumped)', async () => {
    const fx = fixture({ id: 'u1', version: 2 })
    const storage = createMemoryStorage()
    const c = client(fx, {}, storage)
    await c.download(fx.manifest)
    await c.apply('u1')
    const st = await c.state()
    expect(st).toMatchObject({
      current: 'u1',
      previous: null,
      highestVersion: 2,
      pendingVerification: true,
    })
    expect(st.generations.u1?.status).toBe('current')
  })

  it('refuses to apply an unknown or not-fully-downloaded generation', async () => {
    const fx = fixture({ id: 'u1', version: 2 })
    const c = client(fx, {}, createMemoryStorage())
    await expect(c.apply('ghost')).rejects.toBeInstanceOf(UpdateError) // GENERATION_UNKNOWN
  })

  it('rolls back a crash-looping generation on boot (down to the embedded build)', async () => {
    const fx = fixture({ id: 'u1', version: 2 })
    const storage = createMemoryStorage()
    const c = client(fx, { maxBootAttempts: 1 }, storage)
    await c.download(fx.manifest)
    await c.apply('u1')

    expect(await c.boot()).toEqual({ isEmergencyLaunch: false, current: 'u1' }) // 1st chance
    const result = await c.boot() // never confirmed → roll back
    expect(result).toEqual({ isEmergencyLaunch: true, current: null })
    expect(c.isEmergencyLaunch).toBe(true)
    expect((await c.state()).generations.u1?.status).toBe('failed')
  })

  it('rolls a crash-looping update back to the previous good generation, then through to embedded on a second failure', async () => {
    const storage = createMemoryStorage()
    await confirm(fixture({ id: 'u2', version: 2 }), storage) // u2 confirmed good

    const fx3 = fixture({ id: 'u3', version: 3 })
    const c3 = client(fx3, { maxBootAttempts: 1 }, storage)
    await c3.download(fx3.manifest)
    await c3.apply('u3')
    // The confirmed u2 — not the embedded build — is retained as the rollback target.
    expect(await c3.state()).toMatchObject({ current: 'u3', previous: 'u2', highestVersion: 3 })

    expect(await c3.boot()).toEqual({ isEmergencyLaunch: false, current: 'u3' }) // u3 1st chance
    // u3 never confirms → roll back to u2 (good), NOT embedded.
    expect(await c3.boot()).toEqual({ isEmergencyLaunch: false, current: 'u2' })
    expect(c3.isEmergencyLaunch).toBe(false)
    const afterFirst = await c3.state()
    expect(afterFirst).toMatchObject({ current: 'u2', previous: null, highestVersion: 3 })
    expect(afterFirst.generations.u3?.status).toBe('failed')
    expect(afterFirst.generations.u2?.status).toBe('current')
    // Re-armed: u2 is on probation (the failed u3 is never re-accepted — highestVersion stays 3).
    expect(afterFirst.pendingVerification).toBe(true)

    // u2 also crash-loops → the chain now falls through to the embedded build.
    expect(await c3.boot()).toEqual({ isEmergencyLaunch: false, current: 'u2' }) // u2 1st chance
    expect(await c3.boot()).toEqual({ isEmergencyLaunch: true, current: null })
    expect(c3.isEmergencyLaunch).toBe(true)
    expect((await c3.state()).generations.u2?.status).toBe('failed')
  })

  it('apply() keeps the last CONFIRMED generation as the rollback target, never an unconfirmed one', async () => {
    const storage = createMemoryStorage()
    await confirm(fixture({ id: 'u2', version: 2 }), storage) // u2 confirmed good

    const fx3 = fixture({ id: 'u3', version: 3 })
    const c3 = client(fx3, {}, storage)
    await c3.download(fx3.manifest)
    await c3.apply('u3') // u3 applied but never confirmed
    expect((await c3.state()).previous).toBe('u2')

    const fx4 = fixture({ id: 'u4', version: 4 })
    const c4 = client(fx4, {}, storage)
    await c4.download(fx4.manifest)
    await c4.apply('u4') // superseding the still-unconfirmed u3
    const st = await c4.state()
    expect(st.current).toBe('u4')
    expect(st.previous).toBe('u2') // NOT u3 — u3 never proved itself
    expect(st.generations.u3?.status).toBe('failed') // abandoned unconfirmed generation
  })

  it('honors maxBootAttempts > 1 before rolling back', async () => {
    const fx = fixture({ id: 'u1', version: 2 })
    const storage = createMemoryStorage()
    const c = client(fx, { maxBootAttempts: 2 }, storage)
    await c.download(fx.manifest)
    await c.apply('u1')
    expect(await c.boot()).toEqual({ isEmergencyLaunch: false, current: 'u1' }) // attempt 1
    expect(await c.boot()).toEqual({ isEmergencyLaunch: false, current: 'u1' }) // attempt 2
    expect(await c.boot()).toEqual({ isEmergencyLaunch: true, current: null }) // attempt 3 > 2 → roll back
  })

  it("apply() throws ASSET_MISSING when a recorded generation's blob is absent", async () => {
    const fx = fixture({ id: 'u1', version: 2 })
    const base = createMemoryStorage()
    // An "amnesiac" store that accepts writes but never retains blobs, so download()
    // records the generation yet apply()'s presence check fails.
    const amnesiac: UpdateStorage = {
      ...base,
      hasBlob: () => Promise.resolve(false),
      writeBlob: () => Promise.resolve(),
    }
    const c = client(fx, {}, amnesiac)
    await c.download(fx.manifest)
    await expect(c.apply('u1')).rejects.toBeInstanceOf(UpdateError) // ASSET_MISSING
  })

  it('downloads, applies and boots a multi-asset manifest with metadata', async () => {
    const fx = fixture({
      id: 'u1',
      version: 2,
      assets: { 'index.js': 'main', 'logo.png': 'image-bytes', 'font.ttf': 'font-bytes' },
      metadata: { channel: 'stable', notes: 'multi-asset release' },
    })
    const storage = createMemoryStorage()
    const c = client(fx, {}, storage)
    const gen = await c.download(fx.manifest)
    expect(gen).toMatchObject({ id: 'u1', version: 2, status: 'pending' })
    // Every asset's blob is stored, addressed by hash.
    for (const a of [fx.manifest.launchAsset, ...fx.manifest.assets]) {
      expect(await storage.hasBlob(a.sha256)).toBe(true)
    }
    await c.apply('u1')
    expect(await c.boot()).toEqual({ isEmergencyLaunch: false, current: 'u1' })
  })

  it('notifyReady() confirms the generation so later boots do not roll back', async () => {
    const fx = fixture({ id: 'u1', version: 2 })
    const storage = createMemoryStorage()
    const c = client(fx, { maxBootAttempts: 1 }, storage)
    await c.download(fx.manifest)
    await c.apply('u1')
    await c.boot()
    await c.notifyReady()
    expect(await c.boot()).toEqual({ isEmergencyLaunch: false, current: 'u1' })
    expect((await c.state()).pendingVerification).toBe(false)
  })

  it('never downgrades: after applying v2, a v1 manifest checks as up-to-date', async () => {
    const storage = createMemoryStorage()
    const fx2 = fixture({ id: 'u2', version: 2 })
    const c2 = client(fx2, {}, storage)
    await c2.download(fx2.manifest)
    await c2.apply('u2')
    // A v1 manifest from the server, same shared storage → up-to-date (not applied).
    const fx1 = fixture({ id: 'u1', version: 1 })
    const c1 = client(fx1, {}, storage)
    expect(await c1.check()).toEqual({ available: false, reason: 'up-to-date' })
  })

  it('treats expires === now as expired (freeze protection is inclusive)', async () => {
    const fx = fixture({ id: 'u1', version: 2, expires: '2026-06-03T12:00:00.000Z' }) // === now
    await expect(client(fx).check()).rejects.toBeInstanceOf(UpdateError) // MANIFEST_EXPIRED
  })
})

describe('update client — trust boundary (download/apply re-enforce the gates)', () => {
  it('check() → download(): the verified manifest from check() is accepted', async () => {
    const fx = fixture({ id: 'u1', version: 2 })
    const c = client(fx, {}, createMemoryStorage())
    const res = await c.check()
    expect(res.available).toBe(true)
    if (res.available) {
      const gen = await c.download(res.manifest) // res.manifest is a VerifiedManifest
      expect(gen).toMatchObject({ id: 'u1', version: 2, status: 'pending' })
    }
  })

  it('download() rejects an expired manifest even when called without check()', async () => {
    const fx = fixture({ id: 'u1', version: 2, expires: '2026-06-03T06:00:00.000Z' }) // past `now`
    await expect(client(fx).download(fx.manifest)).rejects.toBeInstanceOf(UpdateError) // MANIFEST_EXPIRED
  })

  it('download() rejects a runtime-incompatible manifest', async () => {
    const fx = fixture({ id: 'u1', version: 2, runtimeVersion: '2.0.0' })
    await expect(client(fx).download(fx.manifest)).rejects.toBeInstanceOf(UpdateError) // RUNTIME_MISMATCH
  })

  it('download() rejects a downgrade (not newer than what is applied)', async () => {
    const storage = createMemoryStorage()
    await confirm(fixture({ id: 'hi', version: 5 }), storage) // high-water mark = 5
    const old = fixture({ id: 'lo', version: 2 })
    await expect(client(old, {}, storage).download(old.manifest)).rejects.toBeInstanceOf(
      UpdateError,
    ) // VERSION_NOT_NEWER
  })

  it('apply() refuses to re-activate a generation that previously failed', async () => {
    const storage = createMemoryStorage()
    const fx = fixture({ id: 'u1', version: 2 })
    const c = client(fx, { maxBootAttempts: 1 }, storage)
    await c.download(fx.manifest)
    await c.apply('u1')
    await c.boot()
    await c.boot() // crash-loop → u1 marked failed, rolled back to embedded
    expect((await c.state()).generations.u1?.status).toBe('failed')
    await expect(c.apply('u1')).rejects.toBeInstanceOf(UpdateError) // GENERATION_FAILED
  })
})

describe('update client — manual rollback()', () => {
  it('reverts to the previous good generation', async () => {
    const storage = createMemoryStorage()
    await confirm(fixture({ id: 'u2', version: 2 }), storage)
    const fx3 = fixture({ id: 'u3', version: 3 })
    const c3 = client(fx3, {}, storage)
    await c3.download(fx3.manifest)
    await c3.apply('u3')
    await c3.rollback()
    const st = await c3.state()
    expect(st.current).toBe('u2')
    expect(st.generations.u3?.status).toBe('failed')
    expect(st.generations.u2?.status).toBe('current')
    expect(c3.isEmergencyLaunch).toBe(false) // rolled to u2, not the embedded build
  })

  it('reverts to the embedded build when there is no previous good generation', async () => {
    const fx = fixture({ id: 'u1', version: 2 })
    const storage = createMemoryStorage()
    const c = client(fx, {}, storage)
    await c.download(fx.manifest)
    await c.apply('u1')
    await c.rollback()
    expect((await c.state()).current).toBeNull()
    expect(c.isEmergencyLaunch).toBe(true)
  })

  it('is a no-op on the embedded build', async () => {
    const fx = fixture({ id: 'u1', version: 2 })
    const c = client(fx, {}, createMemoryStorage())
    await c.rollback() // current is null
    expect((await c.state()).current).toBeNull()
  })
})

describe('createUpdateClient — option validation', () => {
  let fx: Fixture
  beforeEach(() => {
    fx = fixture({ id: 'u1', version: 2 }) // after the top-level beforeEach has set `signer`
  })
  it('rejects an empty trustedKeys set', () => {
    expect(() => client(fx, { trustedKeys: [] })).toThrow(TypeError)
  })
  it('rejects a threshold below 1 or above the key count', () => {
    expect(() => client(fx, { threshold: 0 })).toThrow(TypeError)
    expect(() => client(fx, { threshold: 2 })).toThrow(TypeError) // only one trusted key
  })
  it('rejects a non-positive maxBootAttempts', () => {
    expect(() => client(fx, { maxBootAttempts: 0 })).toThrow(TypeError)
  })
  it('rejects a negative embeddedVersion', () => {
    expect(() => client(fx, { embeddedVersion: -1 })).toThrow(TypeError)
  })
  it('rejects an empty runtimeVersion', () => {
    expect(() => client(fx, { runtimeVersion: '' })).toThrow(TypeError)
  })
})
