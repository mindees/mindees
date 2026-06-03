import { describe, expect, it } from 'vitest'
import { UpdateError } from './errors'
import { createMemoryStorage, initialState } from './store'

describe('memory storage', () => {
  it('stores + reads content-addressed blobs', async () => {
    const s = createMemoryStorage()
    const bytes = new Uint8Array([1, 2, 3])
    expect(await s.hasBlob('h')).toBe(false)
    await s.writeBlob('h', bytes)
    expect(await s.hasBlob('h')).toBe(true)
    expect([...(await s.readBlob('h'))]).toEqual([1, 2, 3])
  })

  it('rejects reading a missing blob with ASSET_MISSING', async () => {
    const s = createMemoryStorage()
    await expect(s.readBlob('nope')).rejects.toBeInstanceOf(UpdateError)
  })

  it('persists state (null until written)', async () => {
    const s = createMemoryStorage()
    expect(await s.readState()).toBeNull()
    const st = initialState(5)
    await s.writeState(st)
    expect(await s.readState()).toEqual(st)
  })

  it('clones at the boundary: mutating inputs or outputs cannot corrupt the store', async () => {
    const s = createMemoryStorage()
    const bytes = new Uint8Array([1, 2, 3])
    await s.writeBlob('h', bytes)
    bytes[0] = 99 // mutate the source after writing
    expect([...(await s.readBlob('h'))]).toEqual([1, 2, 3]) // store kept its own copy
    const read = await s.readBlob('h')
    read[0] = 88 // mutate the returned copy
    expect([...(await s.readBlob('h'))]).toEqual([1, 2, 3]) // store unaffected

    await s.writeState(initialState(1))
    const got = await s.readState()
    if (got) (got as { current: string | null }).current = 'tampered'
    expect((await s.readState())?.current).toBeNull() // store unaffected
  })

  it('initialState reflects the embedded version and a clean slate', () => {
    expect(initialState(7)).toEqual({
      current: null,
      previous: null,
      highestVersion: 7,
      pendingVerification: false,
      bootAttempts: 0,
      generations: {},
    })
  })
})
