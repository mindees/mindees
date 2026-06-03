/**
 * The Pulse update manifest: a versioned description of a bundle's files, each
 * addressed by SHA-256. One signature over the manifest's canonical bytes
 * transitively secures every listed file.
 *
 * This module owns the manifest types, a **deterministic** serializer
 * ({@link canonicalManifestJson}) used as the signing input, and a validating
 * parser ({@link parseManifest}) for untrusted input.
 *
 * @module
 */

import { UpdateError } from './errors'

/** One file in an update, addressed by content hash. */
export interface AssetEntry {
  /** Logical path of the file within the bundle (e.g. `"index.js"`). */
  readonly path: string
  /** Size in bytes. */
  readonly size: number
  /** Lowercase hex SHA-256 of the file's bytes. */
  readonly sha256: string
}

/**
 * A versioned description of an update's files. Because every {@link AssetEntry}
 * carries its own SHA-256, a single signature over the manifest secures the whole
 * bundle: verify the signature, then verify each downloaded file against its hash.
 */
export interface UpdateManifest {
  /** Manifest schema version. */
  readonly schema: 1
  /** Unique id for this update (used as the generation id on the device). */
  readonly id: string
  /** Monotonic version; a strictly higher value is newer. Drives rollback protection. */
  readonly version: number
  /** Native-compatibility token; must match the app's runtime version exactly. */
  readonly runtimeVersion: string
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string
  /** Optional ISO-8601 expiry; a past value makes the manifest stale (rejected). */
  readonly expires?: string
  /** The entry-point asset to launch (typically the JS bundle). */
  readonly launchAsset: AssetEntry
  /** Additional assets (images, fonts, …). The launch asset need not be repeated here. */
  readonly assets: readonly AssetEntry[]
  /** Free-form string metadata (channel, release notes, …). */
  readonly metadata?: Readonly<Record<string, string>>
}

/**
 * Every distinct file the manifest references: the launch asset followed by the
 * remaining assets, de-duplicated by SHA-256 (so a launch asset also listed in
 * `assets` is only downloaded/verified once).
 */
export function allAssets(manifest: UpdateManifest): AssetEntry[] {
  const seen = new Set<string>()
  const out: AssetEntry[] = []
  for (const asset of [manifest.launchAsset, ...manifest.assets]) {
    if (seen.has(asset.sha256)) continue
    seen.add(asset.sha256)
    out.push(asset)
  }
  return out
}

/**
 * Serialize a manifest to **canonical** JSON: object keys sorted recursively,
 * compact (no whitespace), `undefined` fields omitted. The same manifest always
 * produces byte-identical output, so signing is reproducible. All numeric fields
 * are integers (no float-formatting ambiguity).
 */
export function canonicalManifestJson(manifest: UpdateManifest): string {
  return stableStringify(manifest)
}

/**
 * Recursively serialize a JSON value with object keys sorted and `undefined`
 * properties omitted, so the same logical value always yields identical bytes.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

const SHA256_HEX = /^[0-9a-f]{64}$/

/**
 * Validate that `input` is a well-formed {@link UpdateManifest} and return it
 * typed. Throws {@link UpdateError} (`MANIFEST_MALFORMED`) for invalid JSON or any
 * shape violation. Used on untrusted input, so validation is strict.
 */
export function parseManifest(input: string): UpdateManifest {
  let raw: unknown
  try {
    raw = JSON.parse(input)
  } catch {
    throw malformed('not valid JSON')
  }
  if (!isObject(raw)) throw malformed('expected an object')

  if (raw.schema !== 1) throw malformed('schema must be 1')
  if (!isNonEmptyString(raw.id)) throw malformed('id must be a non-empty string')
  if (!isNonNegativeInteger(raw.version)) throw malformed('version must be a non-negative integer')
  if (!isNonEmptyString(raw.runtimeVersion))
    throw malformed('runtimeVersion must be a non-empty string')
  if (!isIsoDate(raw.createdAt)) throw malformed('createdAt must be an ISO-8601 date')
  if (raw.expires !== undefined && !isIsoDate(raw.expires)) {
    throw malformed('expires, if present, must be an ISO-8601 date')
  }
  validateAsset(raw.launchAsset, 'launchAsset')
  if (!Array.isArray(raw.assets)) throw malformed('assets must be an array')
  raw.assets.forEach((a, i) => {
    validateAsset(a, `assets[${i}]`)
  })
  if (raw.metadata !== undefined) validateMetadata(raw.metadata)

  return raw as unknown as UpdateManifest
}

/** Assert `value` is a well-formed {@link AssetEntry}; throw `MANIFEST_MALFORMED` otherwise. */
function validateAsset(value: unknown, where: string): asserts value is AssetEntry {
  if (!isObject(value)) throw malformed(`${where} must be an object`)
  if (!isNonEmptyString(value.path)) throw malformed(`${where}.path must be a non-empty string`)
  if (!isNonNegativeInteger(value.size))
    throw malformed(`${where}.size must be a non-negative integer`)
  if (typeof value.sha256 !== 'string' || !SHA256_HEX.test(value.sha256)) {
    throw malformed(`${where}.sha256 must be lowercase hex SHA-256`)
  }
}

/** Assert `value` is a string→string map; throw `MANIFEST_MALFORMED` otherwise. */
function validateMetadata(value: unknown): void {
  if (!isObject(value)) throw malformed('metadata must be an object')
  for (const [k, v] of Object.entries(value)) {
    if (typeof v !== 'string') throw malformed(`metadata.${k} must be a string`)
  }
}

/** Build a `MANIFEST_MALFORMED` {@link UpdateError} with a uniform message prefix. */
function malformed(detail: string): UpdateError {
  return new UpdateError('MANIFEST_MALFORMED', `malformed update manifest: ${detail}`)
}

/** Narrow to a plain (non-array, non-null) object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Narrow to a non-empty string. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** Narrow to an integer ≥ 0. */
function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/**
 * Strict canonical-ISO check: exactly `YYYY-MM-DDTHH:mm:ss.sssZ` (UTC, millisecond
 * precision) **and** a real calendar date. `Date.parse` alone is deliberately
 * avoided — ECMAScript lets it accept implementation-defined formats, so a manifest
 * deemed "valid" (or an `expires` boundary) could differ across Node/browser/Hermes.
 * Round-tripping through `toISOString()` pins one representation on every runtime.
 */
function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_UTC.test(value)) return false
  const ms = Date.parse(value)
  return !Number.isNaN(ms) && new Date(ms).toISOString() === value
}
