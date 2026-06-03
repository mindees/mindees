/**
 * The Pulse update client — ties the manifest, signing, and storage together into a
 * safe OTA flow:
 *
 * - **check()** — fetch + verify the signed manifest; apply the signature, expiry,
 *   runtime-compatibility, and monotonic-version gates.
 * - **download()** — fetch only the assets whose hash isn't already stored, verify
 *   each blob's SHA-256, and record a `pending` generation. Never mutates the live one.
 * - **apply()** — verify the generation's assets are present, then atomically flip
 *   `current`, retaining `previous` + the embedded build as fallbacks.
 * - **boot()** — on startup, roll back a generation that crash-loops before it
 *   confirms itself (readiness handshake), down to the embedded build.
 * - **notifyReady()** — the app calls this once it has launched successfully.
 *
 * @module
 */

import { sha256Hex } from './crypto'
import { UpdateError } from './errors'
import { type AssetEntry, allAssets, canonicalManifestJson, parseManifest } from './manifest'
import {
  type SignedManifest,
  type TrustedKey,
  type VerifiedManifest,
  verifySignedManifest,
} from './signing'
import { type GenerationMeta, initialState, type UpdateState, type UpdateStorage } from './store'

/** Options for {@link createUpdateClient}. */
export interface UpdateClientOptions {
  /** Where blobs + state live. */
  readonly storage: UpdateStorage
  /** Public keys this app trusts to sign updates. */
  readonly trustedKeys: readonly TrustedKey[]
  /** The app's native runtime version (gates compatibility). */
  readonly runtimeVersion: string
  /** Version baked into the binary (the rollback floor). Default 0. */
  readonly embeddedVersion?: number
  /** Valid signatures required from distinct trusted keys. Default 1. */
  readonly threshold?: number
  /** Fetch the current signed manifest from the server. */
  readonly fetchManifest: () => Promise<SignedManifest>
  /** Fetch an asset's bytes. */
  readonly fetchAsset: (asset: AssetEntry) => Promise<Uint8Array>
  /** Boots into an unconfirmed generation before rolling back. Default 1. */
  readonly maxBootAttempts?: number
  /** Clock, for expiry checks + tests. Default `() => Date.now()`. */
  readonly now?: () => number
}

/** Result of {@link UpdateClient.check}. */
export type UpdateCheck =
  | { readonly available: true; readonly manifest: VerifiedManifest }
  | { readonly available: false; readonly reason: 'up-to-date' | 'runtime-mismatch' }

/** Result of {@link UpdateClient.boot}. */
export interface BootResult {
  /** True when boot fell back to the embedded build after a failed generation. */
  readonly isEmergencyLaunch: boolean
  /** The active generation id after boot (`null` = embedded). */
  readonly current: string | null
}

/** The OTA update client. */
export interface UpdateClient {
  /** Run the boot/recovery check (call once at startup, before rendering). */
  boot(): Promise<BootResult>
  /** Check the server for a newer, valid, compatible update. */
  check(): Promise<UpdateCheck>
  /**
   * Download a verified manifest's missing assets and record a pending generation.
   * Accepts only a {@link VerifiedManifest} (from {@link UpdateClient.check}), and
   * re-asserts the freeze / runtime / anti-downgrade gates, so it is safe even if
   * called without `check()` first.
   */
  download(manifest: VerifiedManifest): Promise<GenerationMeta>
  /** Atomically make a downloaded generation the current one (applies next launch). */
  apply(generationId: string): Promise<void>
  /** Confirm the current generation launched successfully. */
  notifyReady(): Promise<void>
  /** Manually roll back the current generation to the previous / embedded one. */
  rollback(): Promise<void>
  /** The persisted state. */
  state(): Promise<UpdateState>
  /**
   * True when the most recent {@link UpdateClient.boot} (or {@link UpdateClient.rollback})
   * fell back to the embedded build after a failed update. Reflects only the latest
   * call — it does not latch across boots.
   */
  readonly isEmergencyLaunch: boolean
}

/**
 * Compute the state after rolling back the current generation: mark it `failed`,
 * promote the previous good generation to `current` (or fall back to the embedded
 * build when there is none), and **re-arm crash-loop detection** on the rolled-to
 * generation so a *second* failure falls through to the next fallback
 * (`current → previous → embedded`). The anti-downgrade floor (`highestVersion`) is
 * preserved, so the failed version is never silently re-accepted. Shared by
 * `boot()`'s crash-loop path and the manual `rollback()`.
 */
function rolledBackState(st: UpdateState): UpdateState {
  const generations = { ...st.generations }
  if (st.current) {
    const failing = generations[st.current]
    if (failing) generations[st.current] = { ...failing, status: 'failed' }
  }
  const rolledTo = st.previous && generations[st.previous] ? st.previous : null
  if (rolledTo) {
    const restored = generations[rolledTo]
    if (restored) generations[rolledTo] = { ...restored, status: 'current' }
  }
  return {
    current: rolledTo,
    // The single retained fallback was just consumed; the next failure on the
    // rolled-to generation must fall through to the embedded build.
    previous: null,
    highestVersion: st.highestVersion,
    // Re-arm: a real rolled-to generation is on probation and must re-confirm via
    // notifyReady(); the embedded build (null) is always trusted, so don't arm it.
    pendingVerification: rolledTo !== null,
    bootAttempts: 0,
    generations,
  }
}

/** Create an {@link UpdateClient}. */
export function createUpdateClient(options: UpdateClientOptions): UpdateClient {
  const {
    storage,
    trustedKeys,
    runtimeVersion,
    embeddedVersion = 0,
    threshold = 1,
    fetchManifest,
    fetchAsset,
    maxBootAttempts = 1,
    now = () => Date.now(),
  } = options

  // Fail fast on misconfiguration: a silently-broken trust/rollback setup is worse
  // than a thrown error at construction. These are programmer errors, not protocol
  // errors, so they surface as TypeError rather than UpdateError.
  if (trustedKeys.length < 1) {
    throw new TypeError('createUpdateClient: trustedKeys must contain at least one key')
  }
  // Bound the threshold by distinct *public keys*: verifySignedManifest counts unique
  // keys, so a threshold above the distinct-key count is unattainable (every check()
  // would fail). Duplicate keyId aliases for one key must not inflate the ceiling.
  const distinctKeyCount = new Set(trustedKeys.map((k) => k.publicKey)).size
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > distinctKeyCount) {
    throw new TypeError(
      `createUpdateClient: threshold must be an integer in [1, ${distinctKeyCount}], got ${threshold}`,
    )
  }
  if (typeof runtimeVersion !== 'string' || runtimeVersion.length === 0) {
    throw new TypeError('createUpdateClient: runtimeVersion must be a non-empty string')
  }
  if (!Number.isInteger(embeddedVersion) || embeddedVersion < 0) {
    throw new TypeError(
      `createUpdateClient: embeddedVersion must be a non-negative integer, got ${embeddedVersion}`,
    )
  }
  if (!Number.isInteger(maxBootAttempts) || maxBootAttempts < 1) {
    throw new TypeError(
      `createUpdateClient: maxBootAttempts must be a positive integer, got ${maxBootAttempts}`,
    )
  }

  let emergency = false

  const readStateOrInit = async (): Promise<UpdateState> =>
    (await storage.readState()) ?? initialState(embeddedVersion)

  /** Throw if the manifest has expired (freeze protection). */
  const assertNotExpired = (manifest: VerifiedManifest): void => {
    if (manifest.expires !== undefined && Date.parse(manifest.expires) <= now()) {
      throw new UpdateError(
        'MANIFEST_EXPIRED',
        `manifest ${manifest.id} expired at ${manifest.expires}`,
      )
    }
  }

  return {
    get isEmergencyLaunch() {
      return emergency
    },

    state: readStateOrInit,

    async check(): Promise<UpdateCheck> {
      const signed = await fetchManifest()
      // Throws SIGNATURE_INVALID if < threshold valid trusted signatures.
      const manifest = verifySignedManifest(signed, trustedKeys, threshold)
      assertNotExpired(manifest)
      if (manifest.runtimeVersion !== runtimeVersion) {
        return { available: false, reason: 'runtime-mismatch' }
      }
      const st = await readStateOrInit()
      if (manifest.version <= st.highestVersion) {
        return { available: false, reason: 'up-to-date' } // never downgrade
      }
      return { available: true, manifest }
    },

    async download(manifest): Promise<GenerationMeta> {
      // `manifest` is signature-verified (the VerifiedManifest brand), but freshness,
      // runtime compatibility, and the anti-downgrade floor depend on *now* + current
      // state — re-assert them here so download() is safe even without a prior check().
      assertNotExpired(manifest)
      if (manifest.runtimeVersion !== runtimeVersion) {
        throw new UpdateError(
          'RUNTIME_MISMATCH',
          `manifest ${manifest.id} targets runtime ${manifest.runtimeVersion}, app is ${runtimeVersion}`,
        )
      }
      const st = await readStateOrInit()
      if (manifest.version <= st.highestVersion) {
        throw new UpdateError(
          'VERSION_NOT_NEWER',
          `manifest ${manifest.id} version ${manifest.version} is not newer than ${st.highestVersion}`,
        )
      }
      for (const asset of allAssets(manifest)) {
        if (await storage.hasBlob(asset.sha256)) continue // content-addressed: already have it
        const bytes = await fetchAsset(asset)
        const actual = sha256Hex(bytes)
        if (actual !== asset.sha256) {
          throw new UpdateError(
            'HASH_MISMATCH',
            `asset ${asset.path}: expected ${asset.sha256}, got ${actual}`,
          )
        }
        await storage.writeBlob(asset.sha256, bytes)
      }
      const generation: GenerationMeta = {
        id: manifest.id,
        version: manifest.version,
        manifest: canonicalManifestJson(manifest),
        status: 'pending',
      }
      await storage.writeState({
        ...st,
        generations: { ...st.generations, [generation.id]: generation },
      })
      return generation
    },

    async apply(generationId): Promise<void> {
      const st = await readStateOrInit()
      const generation = st.generations[generationId]
      if (!generation) throw new UpdateError('GENERATION_UNKNOWN', `no generation ${generationId}`)
      // Never re-activate a generation that previously failed (e.g. crash-looped).
      if (generation.status === 'failed') {
        throw new UpdateError('GENERATION_FAILED', `generation ${generationId} previously failed`)
      }
      // Never activate something older than the high-water mark (anti-downgrade), even
      // if it was downloaded while it was still the newest.
      if (generation.version < st.highestVersion) {
        throw new UpdateError(
          'VERSION_NOT_NEWER',
          `generation ${generationId} version ${generation.version} is older than ${st.highestVersion}`,
        )
      }
      // All assets must be present before we make it current.
      for (const asset of allAssets(parseManifest(generation.manifest))) {
        if (!(await storage.hasBlob(asset.sha256))) {
          throw new UpdateError(
            'ASSET_MISSING',
            `generation ${generationId} missing asset ${asset.path}`,
          )
        }
      }
      // Keep as the rollback target only a *confirmed* outgoing generation. An
      // unconfirmed `current` (still pending) never proved itself, so we retain the
      // older known-good `previous` instead of stranding it behind a suspect build.
      const previous = st.current && !st.pendingVerification ? st.current : st.previous
      const generations = { ...st.generations }
      if (st.current) {
        const outgoing = generations[st.current]
        if (outgoing) {
          generations[st.current] = {
            ...outgoing,
            status: st.current === previous ? 'previous' : 'failed',
          }
        }
      }
      generations[generationId] = { ...generation, status: 'current' }
      await storage.writeState({
        current: generationId,
        previous,
        highestVersion: Math.max(st.highestVersion, generation.version),
        pendingVerification: true,
        bootAttempts: 0,
        generations,
      })
    },

    async boot(): Promise<BootResult> {
      emergency = false // reflects only *this* launch — never latches across boots
      const st = await readStateOrInit()
      if (st.current !== null && st.pendingVerification) {
        const attempts = st.bootAttempts + 1
        if (attempts > maxBootAttempts) {
          // The current generation crash-looped before confirming → roll back.
          const next = rolledBackState(st)
          await storage.writeState(next)
          emergency = next.current === null
          return { isEmergencyLaunch: emergency, current: next.current }
        }
        // Give the current generation another chance to confirm this launch.
        await storage.writeState({ ...st, bootAttempts: attempts })
        return { isEmergencyLaunch: false, current: st.current }
      }
      if ((await storage.readState()) === null) await storage.writeState(st) // persist initial
      return { isEmergencyLaunch: false, current: st.current }
    },

    async notifyReady(): Promise<void> {
      const st = await readStateOrInit()
      if (!st.pendingVerification && st.bootAttempts === 0) return
      await storage.writeState({ ...st, pendingVerification: false, bootAttempts: 0 })
    },

    async rollback(): Promise<void> {
      const st = await readStateOrInit()
      if (st.current === null) return // already on the embedded build
      const next = rolledBackState(st)
      await storage.writeState(next)
      emergency = next.current === null
    },
  }
}
