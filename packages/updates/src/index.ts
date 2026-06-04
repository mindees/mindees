/**
 * `@mindees/updates` (Pulse) — signed OTA updates.
 *
 * Pulse ships a versioned, hash-addressed {@link UpdateManifest}, Ed25519
 * {@link signManifest signing}/{@link verifySignedManifest verification} (threshold +
 * key rotation), a content-addressed {@link UpdateStorage store}, an
 * {@link createUpdateClient update client} with atomic generations + crash-loop
 * rollback, differential bundle diffing, a reference update server, and SDUI.
 *
 * @module
 */

import type { Maturity, PackageInfo } from '@mindees/core'
import { NotImplementedError, notImplemented } from '@mindees/core'

/** The npm package name. */
export const name = '@mindees/updates'

/** The package version. All `@mindees/*` packages share one locked version line. */
export const VERSION = '0.0.0'

/** Current maturity. See the repository `STATUS.md`. */
export const maturity: Maturity = 'experimental'

/** Static identity + maturity metadata for this package. */
export const info: PackageInfo = { name, version: VERSION, maturity }

export {
  type BootResult,
  createUpdateClient,
  type UpdateCheck,
  type UpdateClient,
  type UpdateClientOptions,
} from './client'
export {
  fromHex,
  generateKeypair,
  getPublicKey,
  type Keypair,
  sha256Hex,
  sign,
  toHex,
  utf8,
  verify,
} from './crypto'
export { type ApplyDeltaOptions, applyDelta, diff } from './delta'
export { UpdateError, type UpdateErrorCode } from './errors'
export {
  type AssetEntry,
  allAssets,
  canonicalManifestJson,
  type PatchDescriptor,
  parseManifest,
  type UpdateManifest,
} from './manifest'
export {
  type SignatureEntry,
  type SignedManifest,
  type Signer,
  signManifest,
  type TrustedKey,
  type VerifiedManifest,
  verifySignedManifest,
} from './signing'
export {
  createMemoryStorage,
  type GenerationMeta,
  type GenerationStatus,
  initialState,
  type UpdateState,
  type UpdateStorage,
} from './store'

/**
 * 🔬 Research track — not implemented. A sandboxed WASM module runtime for shipping
 * signed, capability-secure feature modules at runtime. Throws
 * {@link NotImplementedError}; the working path today is signed JS/asset updates
 * (above).
 *
 * @experimental
 */
export function createWasmModuleRuntime(): never {
  throw new NotImplementedError('WASM Component-Model module runtime for OTA updates')
}

export type { Maturity, PackageInfo }
export { NotImplementedError, notImplemented }
