import { describe, expect, it } from 'vitest'
import { generateKeypair, toHex } from './crypto'
import { UpdateError } from './errors'
import type { UpdateManifest } from './manifest'
import { type Signer, signManifest, type TrustedKey, verifySignedManifest } from './signing'

const manifest: UpdateManifest = {
  schema: 1,
  id: 'u1',
  version: 1,
  runtimeVersion: '1.0.0',
  createdAt: '2026-06-03T00:00:00.000Z',
  launchAsset: { path: 'index.js', size: 1, sha256: 'a'.repeat(64) },
  assets: [],
}

function keyPair(id: string): { signer: Signer; trusted: TrustedKey } {
  const { secretKey, publicKey } = generateKeypair()
  return { signer: { keyId: id, secretKey }, trusted: { keyId: id, publicKey: toHex(publicKey) } }
}

describe('signManifest / verifySignedManifest', () => {
  it('round-trips: a signed manifest verifies and parses back', () => {
    const k = keyPair('k1')
    const signed = signManifest(manifest, [k.signer])
    expect(verifySignedManifest(signed, [k.trusted])).toEqual(manifest)
  })

  it('rejects a tampered manifest (signature no longer matches the bytes)', () => {
    const k = keyPair('k1')
    const signed = signManifest(manifest, [k.signer])
    const tampered = { ...signed, manifest: signed.manifest.replace('"version":1', '"version":2') }
    expect(() => verifySignedManifest(tampered, [k.trusted])).toThrow(UpdateError)
  })

  it('rejects a signature from an untrusted key', () => {
    const signing = keyPair('attacker')
    const trusted = keyPair('legit')
    const signed = signManifest(manifest, [signing.signer])
    expect(() => verifySignedManifest(signed, [trusted.trusted])).toThrow(UpdateError)
  })

  it('supports key rotation: trusting old + new, signed by new only, passes at threshold 1', () => {
    const oldKey = keyPair('2025')
    const newKey = keyPair('2026')
    const signed = signManifest(manifest, [newKey.signer])
    expect(verifySignedManifest(signed, [oldKey.trusted, newKey.trusted], 1)).toEqual(manifest)
  })

  it('threshold requires that many DISTINCT valid trusted signatures', () => {
    const a = keyPair('a')
    const b = keyPair('b')
    // Signed by both → threshold 2 passes.
    expect(
      verifySignedManifest(signManifest(manifest, [a.signer, b.signer]), [a.trusted, b.trusted], 2),
    ).toEqual(manifest)
    // Signed by only one → threshold 2 fails.
    expect(() =>
      verifySignedManifest(signManifest(manifest, [a.signer]), [a.trusted, b.trusted], 2),
    ).toThrow(UpdateError)
  })

  it('rejects a non-positive or non-integer threshold (no signature-check bypass)', () => {
    const a = keyPair('a')
    const signed = signManifest(manifest, [a.signer])
    expect(() => verifySignedManifest(signed, [a.trusted], 0)).toThrow(UpdateError)
    expect(() => verifySignedManifest(signed, [a.trusted], -1)).toThrow(UpdateError)
    expect(() => verifySignedManifest(signed, [a.trusted], 1.5)).toThrow(UpdateError)
    // The critical case: threshold 0 must NOT pass a manifest with ZERO signatures.
    expect(() =>
      verifySignedManifest({ manifest: signed.manifest, signatures: [] }, [a.trusted], 0),
    ).toThrow(UpdateError)
  })

  it('counts distinct public keys, not key ids: one key under two trusted ids cannot meet threshold 2', () => {
    const a = keyPair('a')
    // Two trusted entries, different ids but the SAME public key (a rotation misconfig).
    const trustedDup: TrustedKey[] = [
      { keyId: 'a', publicKey: a.trusted.publicKey },
      { keyId: 'a2', publicKey: a.trusted.publicKey },
    ]
    // The one key signs under both ids.
    const signed = signManifest(manifest, [
      a.signer,
      { keyId: 'a2', secretKey: a.signer.secretKey },
    ])
    // Only ONE distinct public key → threshold 2 must fail …
    expect(() => verifySignedManifest(signed, trustedDup, 2)).toThrow(UpdateError)
    // … but threshold 1 is satisfied.
    expect(verifySignedManifest(signed, trustedDup, 1)).toEqual(manifest)
  })
})
