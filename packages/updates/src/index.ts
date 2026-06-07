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
export const VERSION = '0.22.8'

/** Current maturity. See the repository `STATUS.md`. */
export const maturity: Maturity = 'experimental'

/**
 * Static identity + maturity metadata for this package. Frozen so the
 * self-reported identity tooling introspects cannot be mutated at runtime,
 * matching the `readonly` fields of {@link PackageInfo}.
 */
export const info: PackageInfo = Object.freeze({ name, version: VERSION, maturity })

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
/**
 * Server-Driven UI (Pulse §10): compile an allowlisted, schema-versioned JSON tree into a live
 * MindeesNode tree, and apply incremental updates with JSON Merge Patch (RFC 7396) / JSON Patch
 * (RFC 6902). No `eval` — components + actions are pre-registered.
 */
export {
  applyJsonPatch,
  applyMergePatch,
  compileSdui,
  type JsonPatchOp,
  type SduiActionHandler,
  type SduiActionRef,
  type SduiBindRef,
  SduiError,
  type SduiErrorCode,
  type SduiJson,
  type SduiLimits,
  type SduiNode,
  type SduiPropValue,
  type SduiRegistry,
} from './sdui'
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
 * Pulse sandboxed WASM module runtime (spec §10) — ship signed, capability-secure feature modules
 * that run at runtime in their own linear memory, reachable only through the capabilities you grant.
 * Core WebAssembly today; the full Component Model (WASI 0.2/0.3) is a follow-up behind the same seam.
 */
export {
  type Capabilities,
  createWasmModuleRuntime,
  type WasmModuleInstance,
  type WasmModuleRuntime,
  type WasmModuleRuntimeOptions,
} from './wasm'

export type { Maturity, PackageInfo }
export { NotImplementedError, notImplemented }
