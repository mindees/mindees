/**
 * Signing + verification of update manifests (the trust layer over {@link crypto}).
 *
 * A {@link SignedManifest} ships the **exact canonical JSON bytes that were signed**
 * plus the signatures, so the verifier checks the signature over the *received*
 * bytes and never re-serializes — sidestepping JSON-canonicalization edge cases.
 * Verification requires `≥ threshold` valid signatures from **distinct trusted
 * public keys** (default 1), which supports key rotation (trust old + new) and
 * multi-party signing. A signature whose `keyId` is not trusted is ignored.
 *
 * @module
 */

import { fromHex, sign, toHex, utf8, verify } from './crypto'
import { UpdateError } from './errors'
import { canonicalManifestJson, parseManifest, type UpdateManifest } from './manifest'

/** One signature over the canonical manifest bytes, tagged with its key id. */
export interface SignatureEntry {
  /** Which trusted key produced this signature. */
  readonly keyId: string
  /** Lowercase hex Ed25519 signature over `utf8(manifest)`. */
  readonly signature: string
}

/** A manifest plus the canonical bytes that were signed and the signatures. */
export interface SignedManifest {
  /** The exact canonical JSON string that was signed (verify over these bytes). */
  readonly manifest: string
  /** One or more signatures over `manifest`. */
  readonly signatures: readonly SignatureEntry[]
}

/** A signing key (build/server side — keep the secret key offline). */
export interface Signer {
  readonly keyId: string
  readonly secretKey: Uint8Array
}

/** A trusted verification key (embedded in the app). */
export interface TrustedKey {
  readonly keyId: string
  /** Lowercase hex Ed25519 public key. */
  readonly publicKey: string
}

declare const verifiedBrand: unique symbol

/**
 * An {@link UpdateManifest} whose signature has been verified against trusted keys.
 * The brand is unforgeable in TypeScript: only {@link verifySignedManifest} (and
 * therefore {@link "./client".UpdateClient.check}) can produce one. APIs that
 * activate code — `download()` / `apply()` — accept only a `VerifiedManifest`, so a
 * caller cannot smuggle an unsigned, locally-constructed manifest past the trust gate.
 */
export type VerifiedManifest = UpdateManifest & { readonly [verifiedBrand]: true }

/**
 * Sign a manifest with one or more {@link Signer}s. Produces the canonical bytes
 * and a signature per signer.
 */
export function signManifest(manifest: UpdateManifest, signers: readonly Signer[]): SignedManifest {
  if (signers.length === 0) throw new UpdateError('SIGNATURE_INVALID', 'no signers provided')
  const canonical = canonicalManifestJson(manifest)
  const bytes = utf8(canonical)
  const signatures = signers.map((s) => ({
    keyId: s.keyId,
    signature: toHex(sign(bytes, s.secretKey)),
  }))
  return { manifest: canonical, signatures }
}

/**
 * Verify a {@link SignedManifest}: require `≥ threshold` valid signatures from
 * **distinct trusted public keys** (verified over the exact shipped bytes), then
 * parse and return the manifest. `threshold` must be a positive integer. Throws
 * {@link UpdateError} (`SIGNATURE_INVALID`) otherwise.
 */
export function verifySignedManifest(
  signed: SignedManifest,
  trustedKeys: readonly TrustedKey[],
  threshold = 1,
): VerifiedManifest {
  // A non-positive (or non-integer) threshold would otherwise accept a manifest
  // with *zero* valid signatures — a signature-check bypass. Fail closed.
  if (!Number.isInteger(threshold) || threshold < 1) {
    throw new UpdateError(
      'SIGNATURE_INVALID',
      `threshold must be a positive integer, got ${threshold}`,
    )
  }
  const bytes = utf8(signed.manifest)
  const trusted = new Map(trustedKeys.map((k) => [k.keyId, k.publicKey]))
  // Count distinct *public keys* (not key ids): two trusted ids mapped to the same
  // public key are one signer and must not jointly satisfy a multi-key threshold.
  const validPublicKeys = new Set<string>()

  for (const sig of signed.signatures) {
    const publicKeyHex = trusted.get(sig.keyId)
    if (publicKeyHex === undefined) continue // untrusted key id
    if (validPublicKeys.has(publicKeyHex)) continue // this key already counted
    let sigBytes: Uint8Array
    let pubBytes: Uint8Array
    try {
      sigBytes = fromHex(sig.signature)
      pubBytes = fromHex(publicKeyHex)
    } catch {
      continue // malformed hex → not a valid signature
    }
    if (verify(sigBytes, bytes, pubBytes)) validPublicKeys.add(publicKeyHex)
  }

  if (validPublicKeys.size < threshold) {
    throw new UpdateError(
      'SIGNATURE_INVALID',
      `manifest has ${validPublicKeys.size} valid trusted signature(s), need ${threshold}`,
    )
  }
  // Signature verified ⇒ mint the brand. parseManifest still strictly validates shape.
  return parseManifest(signed.manifest) as VerifiedManifest
}
