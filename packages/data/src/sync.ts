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
import { type Clock, createClock, type Hlc } from './hlc'
import { type LwwRegister, mergeRegister } from './lww'

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
} & ({ readonly kind: 'set'; readonly value: T } | { readonly kind: 'del' })

/** A convergent materialized view: per-record LWW state built by applying ops. */
export interface MutationLog<T> {
  /** Merge an op into the state (commutative + idempotent). Returns whether state changed. */
  apply(op: Op<T>): boolean
  /** The live value of a record (or `undefined` if absent/deleted). */
  get(recordId: Id): T | undefined
  /** All live records as `[recordId, value]` pairs. */
  records(): Array<readonly [Id, T]>
  /** The full per-record register state (incl. tombstones) — for persistence. */
  dump(): Array<readonly [Id, LwwRegister<T>]>
}

/** Create a {@link MutationLog}, optionally seeded from a {@link MutationLog.dump}. */
export function createMutationLog<T>(
  initial?: Iterable<readonly [Id, LwwRegister<T>]>,
): MutationLog<T> {
  const state = new Map<Id, LwwRegister<T>>(initial)

  return {
    apply(op): boolean {
      const incoming: LwwRegister<T> =
        op.kind === 'set'
          ? { stamp: op.hlc, op: 'set', value: op.value }
          : { stamp: op.hlc, op: 'del' }
      const existing = state.get(op.recordId)
      const merged = existing ? mergeRegister(existing, incoming) : incoming
      if (existing === merged) return false // mergeRegister returns an arg by reference
      state.set(op.recordId, merged)
      return true
    },
    get(recordId): T | undefined {
      const reg = state.get(recordId)
      return reg ? lwwReg(reg) : undefined
    },
    records(): Array<readonly [Id, T]> {
      const out: Array<readonly [Id, T]> = []
      for (const [recordId, reg] of state) {
        if (reg.op === 'set') out.push([recordId, reg.value])
      }
      return out
    },
    dump(): Array<readonly [Id, LwwRegister<T>]> {
      return [...state]
    },
  }
}

/** Read the live value of a single register (mirrors `lwwGet` for a bare register). */
function lwwReg<T>(reg: LwwRegister<T>): T | undefined {
  return reg.op === 'set' ? reg.value : undefined
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
  /** The materialized per-record register state. */
  readonly registers: ReadonlyArray<readonly [Id, LwwRegister<T>]>
  /** Local ops applied but not yet acked (retried on next sync). */
  readonly outbox: readonly Op<T>[]
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
  /** Optimistically set a record locally and queue the op for the next `sync()`. */
  set(collection: string, recordId: Id, value: T): Op<T>
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
  const clock: Clock = createClock(options.now ? { nodeId, now: options.now } : { nodeId })
  const log = createMutationLog<T>(snapshot?.registers)
  const outbox: Op<T>[] = snapshot ? [...snapshot.outbox] : []
  let seq = snapshot?.seq ?? 0
  let cursor: Cursor | null = snapshot?.cursor ?? null
  let syncing = false

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

    async sync(signal): Promise<void> {
      // Not re-entrant: overlapping calls would double-pull and regress the cursor.
      // Concurrent calls coalesce into the in-flight one; call sync() again afterward.
      if (syncing) return
      syncing = true
      try {
        await runSync(signal)
      } finally {
        syncing = false
      }
    },

    export(): SyncSnapshot<T> {
      return { seq, cursor, registers: log.dump(), outbox: [...outbox] }
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
        // Validate the op's HLC against our clock FIRST (the 10B drift/shape guard),
        // so a malformed or hostile-far-future op is skipped, not merged into state.
        clock.update(op.hlc)
        log.apply(op) // merges by HLC; our own returning ops re-apply idempotently
      } catch {
        // skip a malformed/out-of-bounds op rather than aborting the whole pull
      }
    }
    cursor = next
  }
}
