/**
 * Errors for `@mindees/updates` (Pulse).
 *
 * Every failure carries a stable {@link UpdateErrorCode} so callers can branch on
 * the cause (e.g. distinguish a tampered bundle from a stale manifest) without
 * string-matching messages.
 *
 * @module
 */

/** Stable code identifying why an OTA update operation failed. */
export type UpdateErrorCode =
  /** The manifest JSON is missing required fields or has the wrong shape. */
  | 'MANIFEST_MALFORMED'
  /** Fewer than `threshold` valid signatures from distinct trusted keys. */
  | 'SIGNATURE_INVALID'
  /** A downloaded asset's SHA-256 does not match the manifest. */
  | 'HASH_MISMATCH'
  /** `manifest.expires` is in the past (stale / freeze-attack protection). */
  | 'MANIFEST_EXPIRED'
  /** The manifest's `runtimeVersion` does not match the app (native-incompatibility gate). */
  | 'RUNTIME_MISMATCH'
  /** The manifest/generation is not strictly newer than what is applied (anti-downgrade). */
  | 'VERSION_NOT_NEWER'
  /** An asset a generation needs is not present in the store. */
  | 'ASSET_MISSING'
  /** `apply()`/`rollback()` referenced a generation id that does not exist. */
  | 'GENERATION_UNKNOWN'
  /** `apply()` referenced a generation previously marked failed (cannot be re-activated). */
  | 'GENERATION_FAILED'

/** An OTA update error carrying a stable {@link UpdateErrorCode}. */
export class UpdateError extends Error {
  /** Stable, machine-readable cause. */
  readonly code: UpdateErrorCode

  constructor(code: UpdateErrorCode, message: string) {
    super(message)
    this.name = 'UpdateError'
    this.code = code
  }
}
