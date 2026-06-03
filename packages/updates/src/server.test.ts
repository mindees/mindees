import { beforeEach, describe, expect, it } from 'vitest'
import { generateKeypair, sha256Hex, utf8 } from './crypto'
import type { UpdateManifest } from './manifest'
import {
  createMemoryUpdateServerStore,
  createUpdateServer,
  type MemoryUpdateServerStore,
  type PublishedRelease,
} from './server'
import { type Signer, signManifest } from './signing'

let signer: Signer
beforeEach(() => {
  const { secretKey } = generateKeypair()
  signer = { keyId: 'k1', secretKey }
})

function release(opts: {
  id: string
  version: number
  runtimeVersion?: string
  channel?: string
  rollout?: number
  expires?: string
}): PublishedRelease {
  const content = utf8(`bundle-${opts.id}`)
  const manifest: UpdateManifest = {
    schema: 1,
    id: opts.id,
    version: opts.version,
    runtimeVersion: opts.runtimeVersion ?? '1.0.0',
    createdAt: '2026-06-03T00:00:00.000Z',
    ...(opts.expires ? { expires: opts.expires } : {}),
    launchAsset: { path: 'index.js', size: content.length, sha256: sha256Hex(content) },
    assets: [],
  }
  return {
    signed: signManifest(manifest, [signer]),
    ...(opts.channel ? { channel: opts.channel } : {}),
    ...(opts.rollout !== undefined ? { rollout: opts.rollout } : {}),
  }
}

const NOW = () => Date.parse('2026-06-03T12:00:00.000Z')
function server(store: MemoryUpdateServerStore) {
  return createUpdateServer({ store, now: NOW })
}

describe('update server — resolveUpdate', () => {
  it('offers the highest newer matching release', async () => {
    const store = createMemoryUpdateServerStore()
    store.publish(release({ id: 'u2', version: 2 }))
    store.publish(release({ id: 'u3', version: 3 }))
    const res = await server(store).resolveUpdate({ runtimeVersion: '1.0.0', currentVersion: 1 })
    expect(res).toEqual({ type: 'update', signed: expect.anything() })
    if (res.type === 'update') expect(res.signed.manifest).toContain('"id":"u3"')
  })

  it('reports no-update when nothing is newer than the client', async () => {
    const store = createMemoryUpdateServerStore()
    store.publish(release({ id: 'u2', version: 2 }))
    expect(
      await server(store).resolveUpdate({ runtimeVersion: '1.0.0', currentVersion: 2 }),
    ).toEqual({
      type: 'no-update',
    })
  })

  it('filters by channel', async () => {
    const store = createMemoryUpdateServerStore()
    store.publish(release({ id: 'beta3', version: 3, channel: 'beta' }))
    store.publish(release({ id: 'stable2', version: 2, channel: 'stable' }))
    const stable = await server(store).resolveUpdate({ runtimeVersion: '1.0.0' })
    if (stable.type === 'update') expect(stable.signed.manifest).toContain('"id":"stable2"')
    const beta = await server(store).resolveUpdate({ runtimeVersion: '1.0.0', channel: 'beta' })
    if (beta.type === 'update') expect(beta.signed.manifest).toContain('"id":"beta3"')
  })

  it('filters by runtimeVersion (the native-compatibility gate)', async () => {
    const store = createMemoryUpdateServerStore()
    store.publish(release({ id: 'u2', version: 2, runtimeVersion: '2.0.0' }))
    expect(await server(store).resolveUpdate({ runtimeVersion: '1.0.0' })).toEqual({
      type: 'no-update',
    })
  })

  it('skips an expired release (freeze protection)', async () => {
    const store = createMemoryUpdateServerStore()
    store.publish(release({ id: 'u2', version: 2, expires: '2026-06-03T06:00:00.000Z' })) // before NOW
    expect(await server(store).resolveUpdate({ runtimeVersion: '1.0.0' })).toEqual({
      type: 'no-update',
    })
  })

  it('never advertises a downgrade (anti-downgrade mirror of the client gate)', async () => {
    const store = createMemoryUpdateServerStore()
    store.publish(release({ id: 'u2', version: 2 }))
    expect(
      await server(store).resolveUpdate({ runtimeVersion: '1.0.0', currentVersion: 5 }),
    ).toEqual({
      type: 'no-update',
    })
  })

  it('skips a malformed release rather than failing the whole query', async () => {
    const store = createMemoryUpdateServerStore()
    store.publish({ signed: { manifest: '{not json', signatures: [] } })
    store.publish(release({ id: 'u2', version: 2 }))
    const res = await server(store).resolveUpdate({ runtimeVersion: '1.0.0' })
    if (res.type === 'update') expect(res.signed.manifest).toContain('"id":"u2"')
  })

  it('treats a non-integer/NaN currentVersion as 0 (fail closed)', async () => {
    const store = createMemoryUpdateServerStore()
    store.publish(release({ id: 'u2', version: 2 }))
    // NaN must behave exactly like 0 — not silently disable the gate (NaN comparisons are false)
    expect(
      await server(store).resolveUpdate({ runtimeVersion: '1.0.0', currentVersion: Number.NaN }),
    ).toEqual(await server(store).resolveUpdate({ runtimeVersion: '1.0.0', currentVersion: 0 }))
    expect(
      (await server(store).resolveUpdate({ runtimeVersion: '1.0.0', currentVersion: Number.NaN }))
        .type,
    ).toBe('update')
    // A NaN floor must not defeat a rollback directive either.
    store.rollback({})
    expect(
      await server(store).resolveUpdate({ runtimeVersion: '1.0.0', currentVersion: Number.NaN }),
    ).toEqual({
      type: 'roll-back-to-embedded',
    })
  })

  it('breaks a version tie deterministically by id, regardless of publish order', async () => {
    const a = createMemoryUpdateServerStore()
    a.publish(release({ id: 'zzz', version: 2 }))
    a.publish(release({ id: 'aaa', version: 2 }))
    const b = createMemoryUpdateServerStore()
    b.publish(release({ id: 'aaa', version: 2 }))
    b.publish(release({ id: 'zzz', version: 2 }))
    const ra = await server(a).resolveUpdate({ runtimeVersion: '1.0.0' })
    const rb = await server(b).resolveUpdate({ runtimeVersion: '1.0.0' })
    if (ra.type === 'update') expect(ra.signed.manifest).toContain('"id":"aaa"')
    expect(ra).toEqual(rb) // selection independent of store iteration order
  })
})

describe('update server — staged rollout', () => {
  it('offers a 100% release to everyone (even without a rolloutKey)', async () => {
    const store = createMemoryUpdateServerStore()
    store.publish(release({ id: 'u2', version: 2, rollout: 100 }))
    expect((await server(store).resolveUpdate({ runtimeVersion: '1.0.0' })).type).toBe('update')
  })

  it('withholds a partial release when no rolloutKey is supplied (no random assignment)', async () => {
    const store = createMemoryUpdateServerStore()
    store.publish(release({ id: 'u2', version: 2, rollout: 50 }))
    expect(await server(store).resolveUpdate({ runtimeVersion: '1.0.0' })).toEqual({
      type: 'no-update',
    })
  })

  it('withholds a 0% release from everyone, even with a rolloutKey', async () => {
    const store = createMemoryUpdateServerStore()
    store.publish(release({ id: 'u2', version: 2, rollout: 0 }))
    expect(
      await server(store).resolveUpdate({ runtimeVersion: '1.0.0', rolloutKey: 'device-1' }),
    ).toEqual({
      type: 'no-update',
    })
  })

  it('is deterministic per (release, rolloutKey) and roughly matches the percentage', async () => {
    const store = createMemoryUpdateServerStore()
    store.publish(release({ id: 'u2', version: 2, rollout: 50 }))
    const s = server(store)
    // same key → same outcome across polls
    const a = await s.resolveUpdate({ runtimeVersion: '1.0.0', rolloutKey: 'device-7' })
    const b = await s.resolveUpdate({ runtimeVersion: '1.0.0', rolloutKey: 'device-7' })
    expect(a).toEqual(b)
    // ~half of a population is eligible
    let eligible = 0
    const N = 300
    for (let i = 0; i < N; i++) {
      const r = await s.resolveUpdate({ runtimeVersion: '1.0.0', rolloutKey: `device-${i}` })
      if (r.type === 'update') eligible++
    }
    expect(eligible).toBeGreaterThan(N * 0.35)
    expect(eligible).toBeLessThan(N * 0.65)
  })
})

describe('update server — rollback directive', () => {
  it('returns roll-back-to-embedded for affected clients', async () => {
    const store = createMemoryUpdateServerStore()
    store.publish(release({ id: 'u3', version: 3 }))
    store.rollback({ channel: 'stable', sinceVersion: 2 })
    const s = server(store)
    // a client on v3 is told to roll back …
    expect(await s.resolveUpdate({ runtimeVersion: '1.0.0', currentVersion: 3 })).toEqual({
      type: 'roll-back-to-embedded',
    })
    // … a client below sinceVersion is not affected, and resolves normally
    expect((await s.resolveUpdate({ runtimeVersion: '1.0.0', currentVersion: 1 })).type).toBe(
      'update',
    )
  })

  it('applies a directive with a default sinceVersion (0) to all clients on the channel', async () => {
    const store = createMemoryUpdateServerStore()
    store.rollback({}) // default channel 'stable', sinceVersion 0 → everyone
    expect(
      await server(store).resolveUpdate({ runtimeVersion: '1.0.0', currentVersion: 0 }),
    ).toEqual({
      type: 'roll-back-to-embedded',
    })
  })

  it('scopes the directive to its channel', async () => {
    const store = createMemoryUpdateServerStore()
    store.publish(release({ id: 'beta3', version: 3, channel: 'beta' }))
    store.rollback({ channel: 'stable' })
    expect(
      (
        await server(store).resolveUpdate({
          runtimeVersion: '1.0.0',
          channel: 'beta',
          currentVersion: 1,
        })
      ).type,
    ).toBe('update')
  })
})

describe('update server — getAsset', () => {
  it('serves stored asset bytes and a defensive copy', async () => {
    const store = createMemoryUpdateServerStore()
    const bytes = utf8('asset-bytes')
    const sha = sha256Hex(bytes)
    store.putAsset(sha, bytes)
    const got = await server(store).getAsset(sha)
    expect(got && [...got]).toEqual([...bytes])
  })

  it('does not mutate the store when a returned buffer is modified (defensive copy)', async () => {
    const store = createMemoryUpdateServerStore()
    const bytes = utf8('asset-bytes')
    const sha = sha256Hex(bytes)
    store.putAsset(sha, bytes)
    const s = server(store)
    const first = await s.getAsset(sha)
    if (first) first[0] = 0 // tamper with the returned copy
    const second = await s.getAsset(sha)
    expect(second && [...second]).toEqual([...bytes]) // store unaffected
  })

  it('rejects an uppercase / non-canonical hex address (store keys on lowercase hex)', async () => {
    const store = createMemoryUpdateServerStore()
    const bytes = utf8('x')
    const sha = sha256Hex(bytes)
    store.putAsset(sha, bytes)
    // The same hash in uppercase must NOT resolve — addresses are lowercase-hex only.
    expect(await server(store).getAsset(sha.toUpperCase())).toBeNull()
  })

  it('returns null for a missing or malformed address', async () => {
    const s = server(createMemoryUpdateServerStore())
    expect(await s.getAsset('a'.repeat(64))).toBeNull() // valid hex, not stored
    expect(await s.getAsset('not-a-sha')).toBeNull() // malformed address — no store lookup
  })
})
