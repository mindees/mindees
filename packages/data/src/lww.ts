/**
 * Last-Write-Wins CRDTs for Continuum — an HLC-stamped register and a **per-field**
 * map. State-based (CvRDT): `merge` is commutative, associative, and idempotent, so
 * replicas converge regardless of message order/duplication. The merge key is the 10B
 * {@link Hlc} (a total order), so merge and sync share one ordering. See
 * `docs/adr/0014-continuum-crdt.md`.
 *
 * @module
 */

import { compareHlc, type Hlc } from './hlc'

/** A last-write-wins register: a value (or a delete tombstone) tagged with an HLC stamp. */
export type LwwRegister<V> =
  | { readonly stamp: Hlc; readonly op: 'set'; readonly value: V }
  | { readonly stamp: Hlc; readonly op: 'del' }

/**
 * Merge two registers: keep the one with the greater stamp. When two **different**
 * registers carry the **same** stamp (reachable via a reused `nodeId` across clock
 * instances, or a hostile sync peer that replays a stamp), the content is broken
 * deterministically — **delete wins** over set, and equal ops break by a stable,
 * **total** key over the value — so the result is independent of argument order
 * (required for convergence; a stamp-only compare would diverge by delivery order).
 */
export function mergeRegister<V>(a: LwwRegister<V>, b: LwwRegister<V>): LwwRegister<V> {
  const c = compareHlc(a.stamp, b.stamp)
  if (c !== 0) return c > 0 ? a : b
  if (a.op !== b.op) return a.op === 'del' ? a : b // delete wins a same-stamp tie
  if (a.op === 'set' && b.op === 'set' && !Object.is(a.value, b.value)) {
    return tieKey(a.value) >= tieKey(b.value) ? a : b
  }
  return a
}

/**
 * A **total**, type-tagged key for the same-stamp tie-break. Unlike raw
 * `JSON.stringify`, it (a) never returns `undefined` (which would make the `>=`
 * comparison `false` in BOTH orders → opposite winners → divergence), and (b)
 * distinguishes values that stringify identically but are observably different
 * (e.g. `NaN` and `null` both stringify to `"null"`). For JSON-representable values
 * an equal key implies an equal value (so returning either side is convergent);
 * functions/symbols can never arrive over sync, so their best-effort key is harmless.
 */
function tieKey(value: unknown): string {
  switch (typeof value) {
    case 'undefined':
      return 'u'
    case 'boolean':
      return `b:${value}`
    case 'number':
      // `-0` and `+0` are distinct under Object.is but both stringify to "0"; tag `-0`
      // so a same-stamp -0-vs-0 tie still picks one winner deterministically.
      return Number.isNaN(value) ? 'n:NaN' : Object.is(value, -0) ? 'n:-0' : `n:${value}`
    case 'bigint':
      return `i:${value}`
    case 'string':
      return `s:${value}`
    case 'object': {
      if (value === null) return 'z'
      try {
        return `o:${JSON.stringify(value)}`
      } catch {
        return 'o:circular' // unserializable object — cannot sync as data anyway
      }
    }
    default:
      return `f:${String(value)}` // function | symbol — never crosses the sync boundary
  }
}

/** A per-field last-write-wins map: each field is an independent {@link LwwRegister}. */
export type LwwMap<V> = Readonly<Record<string, LwwRegister<V>>>

/** Set `field` to `value` at `stamp` (never regresses a field carrying a greater stamp). */
export function lwwSet<V>(map: LwwMap<V>, field: string, value: V, stamp: Hlc): LwwMap<V> {
  return withField(map, field, { stamp, op: 'set', value })
}

/** Delete `field` at `stamp` (a tombstone; never regresses a greater stamp). */
export function lwwDelete<V>(map: LwwMap<V>, field: string, stamp: Hlc): LwwMap<V> {
  return withField(map, field, { stamp, op: 'del' })
}

function withField<V>(map: LwwMap<V>, field: string, next: LwwRegister<V>): LwwMap<V> {
  const existing = Object.hasOwn(map, field) ? map[field] : undefined
  const merged = existing ? mergeRegister(existing, next) : next
  const out: Record<string, LwwRegister<V>> = Object.create(null)
  for (const k of Object.keys(map)) out[k] = map[k] as LwwRegister<V>
  out[field] = merged
  return out
}

/** The live value of `field`, or `undefined` if unset or deleted. */
export function lwwGet<V>(map: LwwMap<V>, field: string): V | undefined {
  if (!Object.hasOwn(map, field)) return undefined
  const reg = map[field]
  return reg && reg.op === 'set' ? reg.value : undefined
}

/** Whether `field` is live (present and not a tombstone). */
export function lwwHas<V>(map: LwwMap<V>, field: string): boolean {
  if (!Object.hasOwn(map, field)) return false
  return map[field]?.op === 'set'
}

/** The live (non-deleted) field names. */
export function lwwKeys<V>(map: LwwMap<V>): string[] {
  return Object.keys(map).filter((k) => map[k]?.op === 'set')
}

/** Merge two maps field-by-field (union of fields; {@link mergeRegister} per field). */
export function mergeLwwMap<V>(a: LwwMap<V>, b: LwwMap<V>): LwwMap<V> {
  const out: Record<string, LwwRegister<V>> = Object.create(null)
  for (const k of Object.keys(a)) out[k] = a[k] as LwwRegister<V>
  for (const k of Object.keys(b)) {
    const bv = b[k] as LwwRegister<V>
    const av = Object.hasOwn(out, k) ? out[k] : undefined
    out[k] = av ? mergeRegister(av, bv) : bv
  }
  return out
}
