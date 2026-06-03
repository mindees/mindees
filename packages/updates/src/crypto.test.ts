import { describe, expect, it } from 'vitest'
import {
  fromHex,
  generateKeypair,
  getPublicKey,
  sha256Hex,
  sign,
  toHex,
  utf8,
  verify,
} from './crypto'

describe('crypto', () => {
  it('generates a 32-byte Ed25519 keypair; getPublicKey derives the public key', () => {
    const { secretKey, publicKey } = generateKeypair()
    expect(secretKey).toHaveLength(32)
    expect(publicKey).toHaveLength(32)
    expect(toHex(getPublicKey(secretKey))).toBe(toHex(publicKey))
  })

  it('sign/verify round-trips and rejects a tampered message', () => {
    const { secretKey, publicKey } = generateKeypair()
    const msg = utf8('hello world')
    const sig = sign(msg, secretKey)
    expect(verify(sig, msg, publicKey)).toBe(true)
    expect(verify(sig, utf8('hello worlD'), publicKey)).toBe(false)
  })

  it('verify returns false (never throws) on a malformed signature', () => {
    const { publicKey } = generateKeypair()
    expect(verify(new Uint8Array([1, 2, 3]), utf8('x'), publicKey)).toBe(false)
  })

  it('sha256Hex is deterministic, 64 lowercase-hex chars', () => {
    const a = sha256Hex(utf8('abc'))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(sha256Hex(utf8('abc'))).toBe(a)
    expect(sha256Hex(utf8('abd'))).not.toBe(a)
  })

  it('toHex/fromHex round-trip', () => {
    const bytes = new Uint8Array([0xca, 0xfe, 0x00, 0x12])
    expect(toHex(bytes)).toBe('cafe0012')
    expect([...fromHex('cafe0012')]).toEqual([...bytes])
  })
})
