/**
 * The Continuum local-first **sync engine** — the headline of Phase 10. Two replicas
 * that edited offline converge through a {@link SyncTransport}, tolerating concurrent
 * edits, duplicate delivery, and out-of-order pulls — with no network and no native
 * code (the in-memory {@link createMemoryHub hub} is the real, tested fallback).
 *
 * Built on the 10B HLC + 10C `mergeRegister` (so apply is a CvRDT merge: commutative +
 * idempotent ⇒ convergent). Ops are plain JSON; zero third-party deps. See
 * `docs/adr/0015-continuum-sync-engine.md`.
 *
 * @module
 */

import type { Id } from './collection'
import { type Clock, compareHlc, createClock, type Hlc } from './hlc'
import { type LwwMap, type LwwRegister, mergeRegister } from './lww'

/** An HLC-stamped, idempotently-applied record mutation. */
export type Op<T> = {
  /** Unique, stable op id (`${actor}:${seq}`). Re-applying the same id is a no-op. */
  readonly id: string
  /** The replica that produced the op. */
  readonly actor: string
  /** Monotonic per-actor sequence number. */
  readonly seq: number
  /** The collection the record belongs to. */
  readonly collection: string
  /** The record's id. */
  readonly recordId: Id
  /** The merge key (10B). */
  readonly hlc: Hlc
} & (
  | {
      readonly kind: 'set'
      /**
       * The **changed fields only** (a partial record). Each field is stamped at this op's
       * HLC and merged independently, so two replicas editing *different* fields of the same
       * record both keep their edit. Omitted fields are untouched — `set` MERGES, it does not
       * replace. (Records must be plain objects; the field is the merge granularity.)
       */
      readonly value: Partial<T>
    }
  | { readonly kind: 'del' }
)

/**
 * A record's convergent state: a per-field LWW map plus an optional whole-record delete
 * tombstone. A field is live iff it's a `set` whose stamp is strictly newer than the tombstone
 * (so a delete shadows older fields, but a later field-write *resurrects* that field).
 */
export interface RecordState {
  /** Per-field LWW registers (the merge granularity). */
  readonly fields: LwwMap<unknown>
  /** Whole-record delete stamp, or `null` if never deleted. */
  readonly tomb: Hlc | null
}

/** The persisted dump entry — new format, or a legacy whole-record register (auto-migrated). */
type DumpEntry<T> = readonly [Id, RecordState | LwwRegister<T>]

/** A convergent materialized view: per-record, per-field LWW state built by applying ops. */
export interface MutationLog<T> {
  /** Merge an op into the state (commutative + idempotent). Returns whether state changed. */
  apply(op: Op<T>): boolean
  /** The live value of a record (or `undefined` if absent/deleted). */
  get(recordId: Id): T | undefined
  /** All live records as `[recordId, value]` pairs. */
  records(): Array<readonly [Id, T]>
  /** The full per-record state (incl. tombstones) — for persistence. */
  dump(): Array<readonly [Id, RecordState]>
}

const EMPTY_FIELDS: LwwMap<unknown> = Object.freeze(Object.create(null))

/** Migrate a dump entry: pass through new {@link RecordState}, lift a legacy whole-record register. */
function migrateState<T>(value: RecordState | LwwRegister<T>): RecordState {
  if ('fields' in value) return value // already the new per-field format
  const reg = value as LwwRegister<T>
  if (reg.op === 'del') return { fields: EMPTY_FIELDS, tomb: reg.stamp }
  // Legacy whole-record `set`: lift each field to its own register at the record's stamp.
  const fields: Record<string, LwwRegister<unknown>> = Object.create(null)
  const record = reg.value as Record<string, unknown>
  if (record && typeof record === 'object') {
    for (const k of Object.keys(record))
      fields[k] = { stamp: reg.stamp, op: 'set', value: record[k] }
  }
  return { fields, tomb: null }
}

/** Reconstruct a record's live value from its per-field state (tombstone-shadowed). */
function reconstruct<T>(rs: RecordState): T | undefined {
  const out: Record<string, unknown> = {}
  let live = false
  for (const k of Object.keys(rs.fields)) {
    const reg = rs.fields[k]
    if (!reg || reg.op !== 'set') continue
    // A field survives a whole-record delete only if it was written strictly after it.
    if (rs.tomb !== null && compareHlc(reg.stamp, rs.tomb) <= 0) continue
    out[k] = reg.value
    live = true
  }
  return live ? (out as T) : undefined
}

/** Create a {@link MutationLog}, optionally seeded from a {@link MutationLog.dump} (legacy-migrated). */
export function createMutationLog<T>(initial?: Iterable<DumpEntry<T>>): MutationLog<T> {
  const state = new Map<Id, RecordState>()
  if (initial) for (const [id, value] of initial) state.set(id, migrateState(value))

  return {
    apply(op): boolean {
      const prev = state.get(op.recordId) ?? { fields: EMPTY_FIELDS, tomb: null }
      if (op.kind === 'set') {
        // Merge each changed field independently (per-field LWW): concurrent edits to
        // DIFFERENT fields both survive; same-field conflicts resolve by HLC.
        const value = op.value as Record<string, unknown>
        let changed = false
        let fields = prev.fields
        for (const k of Object.keys(value)) {
          const incoming: LwwRegister<unknown> = { stamp: op.hlc, op: 'set', value: value[k] }
          const existing = Object.hasOwn(fields, k) ? fields[k] : undefined
          const merged = existing ? mergeRegister(existing, incoming) : incoming
          if (merged === existing) continue // idempotent / older — no change to this field
          if (!changed) {
            const copy: Record<string, LwwRegister<unknown>> = Object.create(null)
            for (const j of Object.keys(fields)) copy[j] = fields[j] as LwwRegister<unknown>
            fields = copy
            changed = true
          }
          ;(fields as Record<string, LwwRegister<unknown>>)[k] = merged
        }
        if (!changed) return false
        state.set(op.recordId, { fields, tomb: prev.tomb })
        return true
      }
      // del: advance the whole-record tombstone (max HLC).
      const tomb = prev.tomb === null || compareHlc(op.hlc, prev.tomb) > 0 ? op.hlc : prev.tomb
      if (tomb === prev.tomb) return false
      state.set(op.recordId, { fields: prev.fields, tomb })
      return true
    },
    get(recordId): T | undefined {
      const rs = state.get(recordId)
      return rs ? reconstruct<T>(rs) : undefined
    },
    records(): Array<readonly [Id, T]> {
      const out: Array<readonly [Id, T]> = []
      for (const [recordId, rs] of state) {
        const value = reconstruct<T>(rs)
        if (value !== undefined) out.push([recordId, value])
      }
      return out
    },
    dump(): Array<readonly [Id, RecordState]> {
      return [...state]
    },
  }
}

/** An opaque, monotonic sync cursor (the hub's log position). */
export type Cursor = number

/** Minimal cancellation signal — a real `AbortSignal` is structurally compatible. */
export interface AbortLike {
  readonly aborted: boolean
}

/** The push/pull transport a {@link createSyncEngine sync engine} talks to. */
export interface SyncTransport<T> {
  /** Send local ops upstream; resolves with the ids the server accepted. */
  push(ops: readonly Op<T>[]): Promise<{ readonly acked: readonly string[] }>
  /** Fetch ops after `cursor` (null = from the beginning). */
  pull(cursor: Cursor | null): Promise<{ readonly ops: readonly Op<T>[]; readonly cursor: Cursor }>
}

/** An in-memory reference transport: an append-only, op-id-deduped log. */
export function createMemoryHub<T>(): SyncTransport<T> {
  const log: Array<Op<T>> = []
  const seen = new Set<string>()
  return {
    push(ops): Promise<{ acked: string[] }> {
      const acked: string[] = []
      for (const op of ops) {
        if (!seen.has(op.id)) {
          seen.add(op.id)
          log.push(op)
        }
        acked.push(op.id) // idempotent: already-known ops still ack
      }
      return Promise.resolve({ acked })
    },
    pull(cursor): Promise<{ ops: Op<T>[]; cursor: Cursor }> {
      const from = cursor ?? 0
      return Promise.resolve({ ops: log.slice(from), cursor: log.length })
    },
  }
}

/** A serializable snapshot of a {@link SyncEngine}'s durable state (10F). */
export interface SyncSnapshot<T> {
  /** The next local op sequence number (persisted so ids don't collide across restarts). */
  readonly seq: number
  /** The last pull cursor. */
  readonly cursor: Cursor | null
  /**
   * The materialized per-record state (per-field LWW + tombstone). Legacy snapshots that stored
   * a whole-record register per id are auto-migrated on restore, so old persisted data still loads.
   */
  readonly registers: ReadonlyArray<readonly [Id, RecordState]>
  /** Local ops applied but not yet acked (retried on next sync). */
  readonly outbox: readonly Op<T>[]
  /**
   * The local HLC high-water mark at export time. Restoring it seeds the clock so the
   * first post-restart edit is strictly newer than the replica's pre-restart writes —
   * without it the clock regresses to 0 and a same-record edit can lose the LWW merge.
   */
  readonly clock: Hlc
}

/** Options for {@link createSyncEngine}. */
export interface SyncEngineOptions<T> {
  /**
   * This replica's id (the op `actor`). **Must be globally unique**, and a durable
   * replica must **persist its op sequence** across restarts — op ids are `${nodeId}:${seq}`
   * and the transport de-dupes by id, so a reused `(nodeId, seq)` pair would silently
   * drop the second op. (This in-memory engine resets `seq` on construction; persistence
   * + content-addressed ids land with 10F.)
   */
  readonly nodeId: string
  /** The transport to sync through. */
  readonly transport: SyncTransport<T>
  /** Injected physical clock. Default `() => Date.now()`. */
  readonly now?: () => number
  /** Restore from a previously {@link SyncEngine.export}ed snapshot (durable replica). */
  readonly snapshot?: SyncSnapshot<T>
}

/** A local-first sync engine over a {@link SyncTransport}. */
export interface SyncEngine<T> {
  /**
   * Optimistically **merge** record fields locally and queue the op. Pass only the fields you
   * changed: `set('users', 'u1', { name: 'Ada' })` leaves other fields untouched and lets a
   * concurrent edit to a *different* field on another replica survive. (Per-field LWW — not a
   * whole-record replace. To remove a record use {@link SyncEngine.delete}.)
   */
  set(collection: string, recordId: Id, value: Partial<T>): Op<T>
  /** Optimistically delete a record locally and queue the op. */
  delete(collection: string, recordId: Id): Op<T>
  /** Read a record's live value (local + already-synced state). */
  get(recordId: Id): T | undefined
  /** All live records. */
  records(): Array<readonly [Id, T]>
  /** Ops applied locally but not yet acked by the transport. */
  pending(): readonly Op<T>[]
  /** Push pending ops, then pull + apply remote ops. */
  sync(signal?: AbortLike): Promise<void>
  /** A serializable snapshot to persist (restore via the `snapshot` option). */
  export(): SyncSnapshot<T>
}

/** Create a {@link SyncEngine}. */
export function createSyncEngine<T>(options: SyncEngineOptions<T>): SyncEngine<T> {
  const { nodeId, transport, snapshot } = options
  const clock: Clock = createClock({
    nodeId,
    ...(options.now ? { now: options.now } : {}),
    // Seed from the persisted high-water mark so a restored replica's clock never
    // regresses (a post-restart edit must out-stamp its own pre-restart writes).
    ...(snapshot?.clock
      ? { seed: { wallMs: snapshot.clock.wallMs, counter: snapshot.clock.counter } }
      : {}),
  })
  const log = createMutationLog<T>(snapshot?.registers)
  const outbox: Op<T>[] = snapshot ? [...snapshot.outbox] : []
  let seq = snapshot?.seq ?? 0
  let cursor: Cursor | null = snapshot?.cursor ?? null
  // Serializes sync() runs (see sync() below) so overlapping callers neither double-pull nor
  // lose their queued ops to an early-return coalesce.
  let syncChain: Promise<void> = Promise.resolve()

  const emit = (op: Op<T>): Op<T> => {
    log.apply(op) // optimistic local apply
    outbox.push(op)
    return op
  }

  return {
    set(collection, recordId, value): Op<T> {
      seq += 1
      return emit({
        id: `${nodeId}:${seq}`,
        actor: nodeId,
        seq,
        collection,
        recordId,
        hlc: clock.tick(),
        kind: 'set',
        value,
      })
    },

    delete(collection, recordId): Op<T> {
      seq += 1
      return emit({
        id: `${nodeId}:${seq}`,
        actor: nodeId,
        seq,
        collection,
        recordId,
        hlc: clock.tick(),
        kind: 'del',
      })
    },

    get(recordId): T | undefined {
      return log.get(recordId)
    },
    records(): Array<readonly [Id, T]> {
      return log.records()
    },
    pending(): readonly Op<T>[] {
      return [...outbox]
    },

    sync(signal): Promise<void> {
      // Serialize, don't coalesce: each call waits for the prior run, then does its OWN full
      // push+pull. This keeps runs non-overlapping (no double-pull / cursor regression) while
      // guaranteeing a caller's just-queued ops are actually pushed — the previous "return early
      // while another sync is in flight" silently dropped that work.
      const run = syncChain.then(() => runSync(signal))
      syncChain = run.then(
        () => undefined,
        () => undefined,
      )
      return run
    },

    export(): SyncSnapshot<T> {
      return { seq, cursor, registers: log.dump(), outbox: [...outbox], clock: clock.peek() }
    },
  }

  async function runSync(signal?: AbortLike): Promise<void> {
    if (outbox.length > 0) {
      const sending = [...outbox]
      const { acked } = await transport.push(sending)
      if (signal?.aborted) return
      const ackedSet = new Set(acked)
      // Drop acked ops from the outbox (keep any the server didn't accept).
      for (let i = outbox.length - 1; i >= 0; i--) {
        const op = outbox[i]
        if (op && ackedSet.has(op.id)) outbox.splice(i, 1)
      }
    }
    const { ops, cursor: next } = await transport.pull(cursor)
    if (signal?.aborted) return
    for (const op of ops) {
      try {
        // Advance our local clock toward the op (clamped, so a clock-skewed peer can't
        // poison it), then merge the op. clock.update throws ONLY for a structurally
        // invalid (non-encodable) HLC — never for a merely far-future one — so a
        // legitimately clock-skewed peer's op is still applied (CRDT convergence), and
        // we only ever skip ops that are permanently unusable.
        clock.update(op.hlc)
        log.apply(op) // merges by HLC; our own returning ops re-apply idempotently
      } catch {
        // A structurally-invalid op can never be ordered/stored, so skipping it (and
        // letting the cursor advance past it) loses nothing — unlike a recoverable op.
      }
    }
    cursor = next
  }
}
