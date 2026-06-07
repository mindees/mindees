/**
 * PN-Counter for Continuum — a state-based CRDT integer counter supporting both increment and
 * decrement that converges across replicas. Modeled as two grow-only (G-)counters: `inc` and `dec`,
 * each a per-replica **monotonic total**; the value is `Σinc − Σdec`. `mergeCounter` takes the
 * per-replica MAX of each side, so it is commutative, associative, and idempotent — replicas that
 * apply the same set of operations converge regardless of order or duplication.
 *
 * Each replica must use a stable `replicaId` (e.g. the clock's node id) for its own increments.
 * Plain JSON; safe to sync as data. See `docs/adr/0014-continuum-crdt.md`.
 *
 * @module
 */

/** A PN-Counter: per-replica increment + decrement totals. */
export interface Counter {
  /** replicaId → total increments observed from that replica (monotonic). */
  readonly inc: Readonly<Record<string, number>>
  /** replicaId → total decrements observed from that replica (monotonic). */
  readonly dec: Readonly<Record<string, number>>
}

/** An empty counter (value 0). */
export function emptyCounter(): Counter {
  return { inc: Object.create(null), dec: Object.create(null) }
}

/** Clone a side with `replicaId`'s total raised by `amount` (a G-counter bump). */
function bump(
  side: Readonly<Record<string, number>>,
  replicaId: string,
  amount: number,
): Record<string, number> {
  const next: Record<string, number> = Object.create(null)
  for (const key of Object.keys(side)) next[key] = side[key] as number
  next[replicaId] = (Object.hasOwn(next, replicaId) ? (next[replicaId] as number) : 0) + amount
  return next
}

/** Increment this replica's contribution by `amount` (default 1; a non-positive amount is a no-op). */
export function counterInc(counter: Counter, replicaId: string, amount = 1): Counter {
  if (!(amount > 0)) return counter
  return { inc: bump(counter.inc, replicaId, amount), dec: counter.dec }
}

/** Decrement this replica's contribution by `amount` (default 1; a non-positive amount is a no-op). */
export function counterDec(counter: Counter, replicaId: string, amount = 1): Counter {
  if (!(amount > 0)) return counter
  return { inc: counter.inc, dec: bump(counter.dec, replicaId, amount) }
}

function sum(side: Readonly<Record<string, number>>): number {
  let total = 0
  for (const key of Object.keys(side)) total += side[key] as number
  return total
}

/** The current value: Σ increments − Σ decrements across all replicas. */
export function counterValue(counter: Counter): number {
  return sum(counter.inc) - sum(counter.dec)
}

/** Per-replica max merge of one side (idempotent, order-independent). */
function mergeSide(
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
): Record<string, number> {
  const out: Record<string, number> = Object.create(null)
  for (const key of Object.keys(a)) out[key] = a[key] as number
  for (const key of Object.keys(b)) {
    const value = b[key] as number
    out[key] = Object.hasOwn(out, key) ? Math.max(out[key] as number, value) : value
  }
  return out
}

/** Merge two counters — commutative, associative, idempotent. Replicas converge. */
export function mergeCounter(a: Counter, b: Counter): Counter {
  return { inc: mergeSide(a.inc, b.inc), dec: mergeSide(a.dec, b.dec) }
}
