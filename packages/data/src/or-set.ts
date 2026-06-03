/**
 * Add-wins Observed-Remove Set (OR-Set) for Continuum — a state-based CRDT set of
 * string elements where a concurrent **add wins** over a remove. `merge` is
 * commutative/associative/idempotent, so replicas converge. Each add carries a
 * globally-unique **tag** (the caller supplies one, e.g. `encodeHlc(clock.tick())`);
 * remove tombstones only the tags it has observed, so an add the remover never saw
 * survives. See `docs/adr/0014-continuum-crdt.md`.
 *
 * @module
 */

/** An add-wins OR-Set of string elements. Plain JSON; safe to sync as data. */
export interface OrSet {
  /** element → the add-tags currently recorded for it. */
  readonly adds: Readonly<Record<string, readonly string[]>>
  /** tombstone: add-tags that have been removed. */
  readonly removed: Readonly<Record<string, true>>
}

/** An empty OR-Set. */
export function emptyOrSet(): OrSet {
  return { adds: Object.create(null), removed: Object.create(null) }
}

/** Add `element` with a globally-unique `tag` (e.g. an encoded HLC). */
export function orAdd(set: OrSet, element: string, tag: string): OrSet {
  const adds: Record<string, string[]> = cloneAdds(set.adds)
  const existing = Object.hasOwn(adds, element) ? (adds[element] as string[]) : []
  if (!existing.includes(tag)) adds[element] = [...existing, tag]
  else adds[element] = existing
  return { adds, removed: set.removed }
}

/** Remove `element` by tombstoning every add-tag currently observed for it (add-wins). */
export function orRemove(set: OrSet, element: string): OrSet {
  if (!Object.hasOwn(set.adds, element)) return set
  const observed = (set.adds[element] as string[] | undefined) ?? []
  if (observed.length === 0) return set
  const removed: Record<string, true> = cloneRemoved(set.removed)
  for (const tag of observed) removed[tag] = true
  return { adds: set.adds, removed }
}

/** Whether `element` is present (has an add-tag that has not been removed). */
export function orHas(set: OrSet, element: string): boolean {
  if (!Object.hasOwn(set.adds, element)) return false
  const tags = (set.adds[element] as string[] | undefined) ?? []
  return tags.some((tag) => !Object.hasOwn(set.removed, tag))
}

/** The present elements (sorted for a deterministic snapshot). */
export function orValues(set: OrSet): string[] {
  return Object.keys(set.adds)
    .filter((element) => orHas(set, element))
    .sort()
}

/** Merge two OR-Sets: union `adds` (per element, de-duped) and union `removed`. */
export function mergeOrSet(a: OrSet, b: OrSet): OrSet {
  const adds: Record<string, string[]> = cloneAdds(a.adds)
  for (const element of Object.keys(b.adds)) {
    const bt = (b.adds[element] as string[] | undefined) ?? []
    const at = Object.hasOwn(adds, element) ? (adds[element] as string[]) : []
    const union = new Set<string>(at)
    for (const tag of bt) union.add(tag)
    adds[element] = [...union]
  }
  const removed: Record<string, true> = cloneRemoved(a.removed)
  for (const tag of Object.keys(b.removed)) removed[tag] = true
  return { adds, removed }
}

function cloneAdds(adds: Readonly<Record<string, readonly string[]>>): Record<string, string[]> {
  const out: Record<string, string[]> = Object.create(null)
  for (const element of Object.keys(adds))
    out[element] = [...((adds[element] as string[] | undefined) ?? [])]
  return out
}

function cloneRemoved(removed: Readonly<Record<string, true>>): Record<string, true> {
  const out: Record<string, true> = Object.create(null)
  for (const tag of Object.keys(removed)) out[tag] = true
  return out
}
