/**
 * Version vectors — a compact "what has this replica seen" summary, mapping each
 * replica's `nodeId` to the highest op sequence number observed from it. The sync layer
 * (10D) diffs two vectors to compute exactly the ops a peer is missing. Pure +
 * immutable. See `docs/adr/0013-continuum-hlc-causality.md`.
 *
 * @module
 */

/** Maps each replica `nodeId` to the highest op sequence number seen from it. */
export type VersionVector = Readonly<Record<string, number>>

/**
 * The highest sequence seen from `nodeId` (0 if never). Uses `Object.hasOwn` so an
 * untrusted `nodeId` of `__proto__`/`constructor` reads as 0 rather than an inherited
 * member.
 */
export function vvGet(vv: VersionVector, nodeId: string): number {
  return Object.hasOwn(vv, nodeId) ? (vv[nodeId] ?? 0) : 0
}

/** A new vector with `nodeId` raised to `max(current, seq)`. */
export function vvObserve(vv: VersionVector, nodeId: string, seq: number): VersionVector {
  if (seq <= vvGet(vv, nodeId)) return vv
  // Object literal computed key uses CreateDataProperty (not [[Set]]), so even a
  // `__proto__` nodeId becomes an own data property rather than mutating a prototype.
  return { ...vv, [nodeId]: seq }
}

/** A new vector that is the per-replica maximum of `a` and `b`. */
export function vvMerge(a: VersionVector, b: VersionVector): VersionVector {
  // null-prototype accumulator: `out[nodeId] = …` then creates an own property even for
  // a `__proto__` nodeId, instead of hitting Object.prototype's accessor (which would
  // silently drop the entry).
  const out: Record<string, number> = Object.create(null)
  for (const nodeId of Object.keys(a)) out[nodeId] = vvGet(a, nodeId)
  for (const nodeId of Object.keys(b)) {
    const bv = vvGet(b, nodeId)
    if (bv > (out[nodeId] ?? 0)) out[nodeId] = bv
  }
  return out
}

/** Whether `a` covers everything `b` has seen (`a[k] >= b[k]` for every `k` in `b`). */
export function vvDominates(a: VersionVector, b: VersionVector): boolean {
  for (const nodeId of Object.keys(b)) {
    if (vvGet(a, nodeId) < (b[nodeId] ?? 0)) return false
  }
  return true
}

/** Whether two vectors are equal (same non-zero entries). */
export function vvEquals(a: VersionVector, b: VersionVector): boolean {
  return vvDominates(a, b) && vvDominates(b, a)
}
