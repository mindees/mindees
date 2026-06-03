/**
 * Content-addressed update storage + the persisted generation state.
 *
 * Storage is an **injected capability** (like the CLI's `FileSystem`), so the
 * client is deterministic in tests and backend-agnostic (filesystem, S3/R2, RN
 * storage). Blobs are keyed by SHA-256, so identical files across updates are
 * stored once and only changed hashes are ever downloaded — differential download
 * falls out of content-addressing for free. {@link createMemoryStorage} is the
 * in-memory reference implementation.
 *
 * @module
 */

import { UpdateError } from './errors'

/** Lifecycle status of a stored generation. */
export type GenerationStatus = 'pending' | 'current' | 'previous' | 'failed'

/** Metadata for one downloaded update generation. */
export interface GenerationMeta {
  /** The manifest id (also the generation id). */
  readonly id: string
  /** The manifest's monotonic version. */
  readonly version: number
  /** The verified canonical manifest JSON. */
  readonly manifest: string
  /** Where this generation sits in the lifecycle. */
  readonly status: GenerationStatus
}

/** Persisted client state: the generation pointers + rollback bookkeeping. */
export interface UpdateState {
  /** Active generation id, or `null` to run the embedded build. */
  readonly current: string | null
  /** Last-known-good fallback generation id (or `null` = embedded). */
  readonly previous: string | null
  /** Highest version ever applied — rejects downgrades (rollback protection). */
  readonly highestVersion: number
  /** The current generation has not yet confirmed itself via `notifyReady()`. */
  readonly pendingVerification: boolean
  /** Boots into an unconfirmed current generation (crash-loop detection). */
  readonly bootAttempts: number
  /** All known generations, by id. */
  readonly generations: Readonly<Record<string, GenerationMeta>>
}

/** Injected storage capability: content-addressed blobs + a small state document. */
export interface UpdateStorage {
  /** Whether a blob with this SHA-256 is stored. */
  hasBlob(sha256: string): Promise<boolean>
  /** Read a blob's bytes (throws `ASSET_MISSING` if absent). */
  readBlob(sha256: string): Promise<Uint8Array>
  /** Store a blob under its SHA-256. */
  writeBlob(sha256: string, data: Uint8Array): Promise<void>
  /** Read the persisted state, or `null` on a fresh install. */
  readState(): Promise<UpdateState | null>
  /** Persist the state. */
  writeState(state: UpdateState): Promise<void>
}

/** The initial state for a fresh install (running the embedded build). */
export function initialState(embeddedVersion = 0): UpdateState {
  return {
    current: null,
    previous: null,
    highestVersion: embeddedVersion,
    pendingVerification: false,
    bootAttempts: 0,
    generations: {},
  }
}

/** An in-memory {@link UpdateStorage} for tests and as a reference implementation. */
export function createMemoryStorage(): UpdateStorage {
  const blobs = new Map<string, Uint8Array>()
  let state: UpdateState | null = null

  // Clone at the boundary: callers must never hold a reference into the store's
  // internals, or they could mutate a blob after writeBlob() (breaking the
  // content-addressed integrity guarantee) or mutate state without a writeState().
  const cloneState = (value: UpdateState | null): UpdateState | null =>
    value === null
      ? null
      : {
          ...value,
          generations: Object.fromEntries(
            Object.entries(value.generations).map(([id, meta]) => [id, { ...meta }]),
          ),
        }

  return {
    hasBlob: (sha256) => Promise.resolve(blobs.has(sha256)),
    readBlob: (sha256) => {
      const blob = blobs.get(sha256)
      if (!blob) return Promise.reject(new UpdateError('ASSET_MISSING', `blob ${sha256} not found`))
      return Promise.resolve(new Uint8Array(blob))
    },
    writeBlob: (sha256, data) => {
      blobs.set(sha256, new Uint8Array(data))
      return Promise.resolve()
    },
    readState: () => Promise.resolve(cloneState(state)),
    writeState: (next) => {
      state = cloneState(next)
      return Promise.resolve()
    },
  }
}
