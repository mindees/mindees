/**
 * The Pulse **reference update server** core — the other side of the wire from the
 * {@link "./client".UpdateClient}. It is a pure, capability-injected function of an
 * {@link UpdateServerStore} (the release list + asset bytes + optional rollback
 * directives) and a clock, so selection / staged-rollout / anti-downgrade / freeze
 * logic is deterministic and unit-testable with no network and no native I/O.
 *
 * It is exported from the **`@mindees/updates/server`** subpath, never the device
 * entry, so a client bundle never pulls server code. A thin `node:http` adapter lives
 * in `examples/pulse-server/`.
 *
 * **The server never signs.** Signing is an offline build step (see `signing.ts`); the
 * store holds only pre-signed {@link SignedManifest} objects, and the server returns
 * them verbatim — it holds no private key. See `docs/adr/0010-pulse-reference-server.md`.
 *
 * @module
 */

import { sha256Hex, utf8 } from './crypto'
import { parseManifest } from './manifest'
import type { SignedManifest } from './signing'

/** A published release the server can offer. */
export interface PublishedRelease {
  /** The pre-signed manifest (the server never signs — signing is offline). */
  readonly signed: SignedManifest
  /** Release channel; defaults to `"stable"`. */
  readonly channel?: string
  /** Staged-rollout percentage in `[0, 100]`. Default 100 (everyone). */
  readonly rollout?: number
}

/** An operator directive to roll a channel's clients back to the embedded build. */
export interface RollbackDirective {
  /** Channel the directive applies to; defaults to `"stable"`. */
  readonly channel?: string
  /** Applies to clients whose current version is ≥ this. Default 0 (all). */
  readonly sinceVersion?: number
}

/** Injected server I/O: the release catalog + asset bytes (+ optional rollbacks). */
export interface UpdateServerStore {
  /** Every published release the server may select among. */
  listReleases(): Promise<readonly PublishedRelease[]>
  /** Asset bytes by lowercase-hex SHA-256, or `null` if absent. */
  getAsset(sha256: string): Promise<Uint8Array | null>
  /** Active rollback directives. Optional; default none. */
  listRollbacks?(): Promise<readonly RollbackDirective[]>
}

/** A client's update query. */
export interface ResolveUpdateQuery {
  /** The client's native runtime version (must match a release exactly). */
  readonly runtimeVersion: string
  /** Channel to resolve against; defaults to `"stable"`. */
  readonly channel?: string
  /**
   * The client's anti-downgrade floor — its **high-water mark** (`state().highestVersion`),
   * not necessarily the version currently running (which can be lower after a rollback).
   * The server never offers a version `≤` this. Default 0. A non-integer/negative value
   * is treated as 0 (fail closed).
   */
  readonly currentVersion?: number
  /** A stable per-device id for deterministic staged-rollout bucketing. */
  readonly rolloutKey?: string
}

/** The outcome of {@link UpdateServer.resolveUpdate}. */
export type UpdateResolution =
  | { readonly type: 'update'; readonly signed: SignedManifest }
  | { readonly type: 'no-update' }
  | { readonly type: 'roll-back-to-embedded' }

/** Options for {@link createUpdateServer}. */
export interface UpdateServerOptions {
  /** Injected release/asset/rollback I/O. */
  readonly store: UpdateServerStore
  /** Clock, for expiry checks + tests. Default `() => Date.now()`. */
  readonly now?: () => number
}

/** The reference update server. */
export interface UpdateServer {
  /** Resolve the best update for a client query (or no-update / roll-back). */
  resolveUpdate(query: ResolveUpdateQuery): Promise<UpdateResolution>
  /** Serve an asset's bytes by SHA-256 (or `null` if absent / malformed address). */
  getAsset(sha256: string): Promise<Uint8Array | null>
}

const SHA256_HEX = /^[0-9a-f]{64}$/
const UINT32 = 0x1_0000_0000

/** Deterministic `[0, 100)` cohort bucket for a (release, device) pair. */
function rolloutBucket(manifestId: string, rolloutKey: string): number {
  const hex = sha256Hex(utf8(`${manifestId}:${rolloutKey}`)).slice(0, 8)
  return (Number.parseInt(hex, 16) / UINT32) * 100
}

/** Whether a device is eligible for a release at the given rollout percentage. */
function isEligible(manifestId: string, rollout: number, rolloutKey: string | undefined): boolean {
  if (rollout >= 100) return true
  if (rollout <= 0) return false
  if (rolloutKey === undefined) return false // a partial rollout needs a stable key
  return rolloutBucket(manifestId, rolloutKey) < rollout
}

/** Create a {@link UpdateServer}. */
export function createUpdateServer(options: UpdateServerOptions): UpdateServer {
  const { store, now = () => Date.now() } = options

  return {
    async resolveUpdate(query): Promise<UpdateResolution> {
      const channel = query.channel ?? 'stable'
      // Fail closed on a degenerate floor: a NaN/negative/non-integer currentVersion
      // would otherwise make `version <= currentVersion` and `>= sinceVersion` silently
      // no-op (NaN comparisons are always false). Treat anything invalid as 0.
      const cv = query.currentVersion
      const currentVersion = typeof cv === 'number' && Number.isInteger(cv) && cv >= 0 ? cv : 0

      // 1. Emergency rollback directive for this channel takes precedence (the
      //    "stop everything" signal). To ship a forward fix instead, clear the
      //    directive — see ADR-0010 (a version-bounded directive is a future extension).
      const rollbacks = store.listRollbacks ? await store.listRollbacks() : []
      for (const rb of rollbacks) {
        if ((rb.channel ?? 'stable') === channel && currentVersion >= (rb.sinceVersion ?? 0)) {
          return { type: 'roll-back-to-embedded' }
        }
      }

      // 2. Best eligible release: channel + runtime match, strictly newer than the
      //    client's floor, not expired, rollout-eligible; highest version wins, ties
      //    broken by id so selection never depends on store iteration order.
      const releases = await store.listReleases()
      let best: { version: number; id: string; signed: SignedManifest } | null = null
      for (const rel of releases) {
        if ((rel.channel ?? 'stable') !== channel) continue
        let id: string
        let version: number
        let runtimeVersion: string
        let expires: string | undefined
        try {
          const m = parseManifest(rel.signed.manifest)
          id = m.id
          version = m.version
          runtimeVersion = m.runtimeVersion
          expires = m.expires
        } catch {
          continue // skip a malformed release rather than failing the whole query
        }
        if (runtimeVersion !== query.runtimeVersion) continue
        if (version <= currentVersion) continue // anti-downgrade: never offer an older build
        if (expires !== undefined && Date.parse(expires) <= now()) continue // freeze
        if (!isEligible(id, rel.rollout ?? 100, query.rolloutKey)) continue
        if (!best || version > best.version || (version === best.version && id < best.id)) {
          best = { version, id, signed: rel.signed }
        }
      }
      return best ? { type: 'update', signed: best.signed } : { type: 'no-update' }
    },

    getAsset(sha256): Promise<Uint8Array | null> {
      if (!SHA256_HEX.test(sha256)) return Promise.resolve(null)
      return store.getAsset(sha256)
    },
  }
}

/** A mutable in-memory {@link UpdateServerStore} for tests, examples, and reference. */
export interface MemoryUpdateServerStore extends UpdateServerStore {
  /** Publish a release. */
  publish(release: PublishedRelease): void
  /** Store an asset's bytes under its SHA-256. */
  putAsset(sha256: string, bytes: Uint8Array): void
  /** Post a rollback directive. */
  rollback(directive: RollbackDirective): void
}

/** Create an in-memory {@link UpdateServerStore}. */
export function createMemoryUpdateServerStore(): MemoryUpdateServerStore {
  const releases: PublishedRelease[] = []
  const rollbacks: RollbackDirective[] = []
  const assets = new Map<string, Uint8Array>()
  return {
    listReleases: () => Promise.resolve([...releases]),
    listRollbacks: () => Promise.resolve([...rollbacks]),
    getAsset: (sha256) => {
      const bytes = assets.get(sha256)
      return Promise.resolve(bytes ? new Uint8Array(bytes) : null)
    },
    publish: (release) => {
      releases.push(release)
    },
    putAsset: (sha256, bytes) => {
      assets.set(sha256, new Uint8Array(bytes))
    },
    rollback: (directive) => {
      rollbacks.push(directive)
    },
  }
}
