/**
 * Cryptographic primitives for Pulse: Ed25519 signing/verification and SHA-256
 * content hashing.
 *
 * These use the pure-JavaScript [@noble](https://github.com/paulmillr/noble-curves)
 * libraries, which run on Node, browsers, **and Hermes/React Native** — where
 * WebCrypto's Ed25519 is unavailable. No native module, no `crypto.subtle`
 * dependency, so the verifier works on every MindeesNative target.
 *
 * @module
 */

import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js'

/** An Ed25519 keypair (raw 32-byte keys). */
export interface Keypair {
  /** The 32-byte secret (signing) key. Keep offline; never ship it. */
  readonly secretKey: Uint8Array
  /** The 32-byte public (verification) key. Safe to embed in the app. */
  readonly publicKey: Uint8Array
}

/** Generate a fresh Ed25519 keypair. */
export function generateKeypair(): Keypair {
  const { secretKey, publicKey } = ed25519.keygen()
  return { secretKey, publicKey }
}

/** Derive the public key for a given secret key. */
export function getPublicKey(secretKey: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(secretKey)
}

/** Sign `message` with `secretKey`, returning the 64-byte Ed25519 signature. */
export function sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return ed25519.sign(message, secretKey)
}

/**
 * Verify `signature` over `message` against `publicKey`. Returns `false` (never
 * throws) for a wrong signature **or** malformed input — a verifier on untrusted
 * data must treat any failure as "not valid".
 */
export function verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return ed25519.verify(signature, message, publicKey)
  } catch {
    return false
  }
}

/** SHA-256 of `data`, as a lowercase hex string. */
export function sha256Hex(data: Uint8Array): string {
  return bytesToHex(sha256(data))
}

/** UTF-8 encode a string to bytes (no DOM/Node `TextEncoder` dependency). */
export function utf8(text: string): Uint8Array {
  return utf8ToBytes(text)
}

/** Lowercase-hex encode bytes (e.g. to serialize a public key). */
export function toHex(bytes: Uint8Array): string {
  return bytesToHex(bytes)
}

/** Decode a hex string to bytes. Throws on invalid hex. */
export function fromHex(hex: string): Uint8Array {
  return hexToBytes(hex)
}
