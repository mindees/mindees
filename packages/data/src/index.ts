/**
 * `@mindees/data` (Continuum) — local-first reactive store + sync.
 *
 * Phase 10 ships the **reactive document store**: {@link createCollection}, a
 * signals-native, in-memory collection with fine-grained reactive reads
 * (`get`/`has`/`all`/`where`/`size`), atomic mutations (`insert`/`upsert`/`update`/
 * `delete`/`clear`/`tx`), and {@link Collection.optimistic optimistic} changes that can
 * be rolled back. Built on `@mindees/core` signals only. Hybrid-logical-clock causality,
 * CRDT conflict resolution, the local-first sync engine, a reference sync server on the
 * `@mindees/data/server` subpath, and a persistence contract/export/restore path build
 * on this. Native durable adapters, production sync hardening, and CRDT-library/rich-text
 * interop remain research tracks.
 *
 * @module
 */

import type { Maturity, PackageInfo } from '@mindees/core'
import { NotImplementedError, notImplemented } from '@mindees/core'

/** The npm package name. */
export const name = '@mindees/data'

/** The package version. All `@mindees/*` packages share one locked version line. */
export const VERSION = '0.0.0'

/** Current maturity of this package. See the repository `STATUS.md`. */
export const maturity: Maturity = 'experimental'

/** Static identity + maturity metadata for this package. */
export const info: PackageInfo = { name, version: VERSION, maturity }

export {
  type Collection,
  type CollectionOptions,
  createCollection,
  type Id,
  type OptimisticChange,
} from './collection'
export { DataError, type DataErrorCode } from './errors'
export {
  type Clock,
  type ClockOptions,
  compareHlc,
  createClock,
  decodeHlc,
  encodeHlc,
  type Hlc,
} from './hlc'
export {
  type LwwMap,
  type LwwRegister,
  lwwDelete,
  lwwGet,
  lwwHas,
  lwwKeys,
  lwwSet,
  mergeLwwMap,
  mergeRegister,
} from './lww'
export {
  emptyOrSet,
  mergeOrSet,
  type OrSet,
  orAdd,
  orHas,
  orRemove,
  orValues,
} from './or-set'
export { createMemoryPersistence, type Persistence } from './persist'
export {
  type Cursor,
  createMemoryHub,
  createMutationLog,
  createSyncEngine,
  type MutationLog,
  type Op,
  type SyncEngine,
  type SyncEngineOptions,
  type SyncSnapshot,
  type SyncTransport,
} from './sync'
export {
  type VersionVector,
  vvDominates,
  vvEquals,
  vvGet,
  vvMerge,
  vvObserve,
} from './version-vector'

export type { Maturity, PackageInfo }
export { NotImplementedError, notImplemented }
