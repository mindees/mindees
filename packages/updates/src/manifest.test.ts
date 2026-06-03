import { describe, expect, it } from 'vitest'
import { UpdateError } from './errors'
import { allAssets, canonicalManifestJson, parseManifest, type UpdateManifest } from './manifest'

const h = (c: string) => c.repeat(64) // a fake 64-char lowercase-hex sha256

const manifest: UpdateManifest = {
  schema: 1,
  id: 'u1',
  version: 3,
  runtimeVersion: '1.0.0',
  createdAt: '2026-06-03T00:00:00.000Z',
  launchAsset: { path: 'index.js', size: 100, sha256: h('a') },
  assets: [{ path: 'logo.png', size: 20, sha256: h('b') }],
}

describe('canonicalManifestJson', () => {
  it('is deterministic and key-sorted regardless of construction order', () => {
    const reordered: UpdateManifest = {
      assets: manifest.assets,
      version: 3,
      id: 'u1',
      schema: 1,
      launchAsset: manifest.launchAsset,
      runtimeVersion: '1.0.0',
      createdAt: '2026-06-03T00:00:00.000Z',
    }
    expect(canonicalManifestJson(manifest)).toBe(canonicalManifestJson(reordered))
    // top-level keys are alphabetically sorted in the output
    expect(canonicalManifestJson(manifest).startsWith('{"assets":')).toBe(true)
  })

  it('omits undefined optional fields', () => {
    expect(canonicalManifestJson(manifest)).not.toContain('expires')
    expect(canonicalManifestJson({ ...manifest, expires: '2026-07-01T00:00:00.000Z' })).toContain(
      'expires',
    )
  })
})

describe('allAssets', () => {
  it('lists the launch asset + assets, de-duplicated by sha256', () => {
    const paths = allAssets(manifest).map((a) => a.path)
    expect(paths).toEqual(['index.js', 'logo.png'])
    // a launch asset also present in assets is not duplicated
    const dup = allAssets({ ...manifest, assets: [manifest.launchAsset, ...manifest.assets] })
    expect(dup.map((a) => a.sha256)).toEqual([h('a'), h('b')])
  })
})

describe('parseManifest', () => {
  it('round-trips a canonical manifest', () => {
    expect(parseManifest(canonicalManifestJson(manifest))).toEqual(manifest)
  })

  it('rejects invalid JSON and shape violations with MANIFEST_MALFORMED', () => {
    const bad: Array<[string, unknown]> = [
      ['not json', '{nope'],
      ['wrong schema', { ...manifest, schema: 2 }],
      ['empty id', { ...manifest, id: '' }],
      ['negative version', { ...manifest, version: -1 }],
      ['bad date', { ...manifest, createdAt: 'never' }],
      ['non-canonical date (missing ms)', { ...manifest, createdAt: '2026-06-03T00:00:00Z' }],
      ['date-only', { ...manifest, createdAt: '2026-06-03' }],
      ['impossible calendar date', { ...manifest, createdAt: '2026-13-40T00:00:00.000Z' }],
      ['non-UTC offset', { ...manifest, createdAt: '2026-06-03T00:00:00.000+05:00' }],
      ['short sha256', { ...manifest, launchAsset: { path: 'x', size: 1, sha256: 'abc' } }],
      ['non-string metadata value', { ...manifest, metadata: { n: 1 } }],
    ]
    for (const [label, value] of bad) {
      const input = typeof value === 'string' ? value : JSON.stringify(value)
      expect(() => parseManifest(input), label).toThrow(UpdateError)
    }
  })
})
