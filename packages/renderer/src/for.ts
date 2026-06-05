/**
 * Keyed list reconciliation — the renderer side of core's {@link KeyedRegion}.
 *
 * Materializes a keyed list so rows keep host-node identity (focus, caret, scroll, input state)
 * across reorders, instead of the full teardown+rebuild a plain `() => items().map(...)` causes.
 * On each change: existing rows are **reused** (their item/index signals patched in place), new
 * keys **created** (each in its own reactive root), removed keys **disposed**, and host nodes
 * **moved** via a longest-increasing-subsequence pass so the minimum number move (append → 0,
 * adjacent swap → 1, full reverse → n−1). See ADR-0024.
 *
 * @module
 */

import {
  batch,
  createRoot,
  effect,
  type KeyedRegion,
  onCleanup,
  type Signal,
  signal,
  untrack,
} from '@mindees/core'
import type { HostBackend } from './backend'
import { mountNode } from './render'

/** One reconciled row: its host nodes, reactive item/index inputs, and its disposer. */
interface Entry<N, T> {
  nodes: N[]
  readonly itemSig: Signal<T>
  readonly indexSig: Signal<number>
  readonly dispose: () => void
}

/**
 * Indices (into `seq`) forming a longest strictly-increasing subsequence — the rows already in
 * correct relative order, which therefore must NOT move. Standard O(n log n) patience sort.
 */
function longestIncreasingSubsequence(seq: readonly number[]): Set<number> {
  const n = seq.length
  const result = new Set<number>()
  if (n === 0) return result
  const tails: number[] = [] // tails[k] = index into seq of the smallest tail of a length-(k+1) run
  const prev: number[] = new Array(n).fill(-1)
  for (let i = 0; i < n; i++) {
    const value = seq[i] as number
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((seq[tails[mid] as number] as number) < value) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) prev[i] = tails[lo - 1] as number
    tails[lo] = i
  }
  let k = tails[tails.length - 1] as number
  while (k !== -1) {
    result.add(k)
    k = prev[k] as number
  }
  return result
}

/**
 * Materialize a {@link KeyedRegion} into `parent` before `anchor`, reconciling by key on every
 * change. Returns a stable live array (current content followed by a slot marker), the same
 * contract as the renderer's reactive-child binding. Must run inside an owner (an enclosing
 * `createRoot`/region) so its cleanup is scoped.
 */
export function bindKeyedChild<N, T>(
  region: KeyedRegion<T>,
  backend: HostBackend<N>,
  parent: N,
  initialAnchor: N | null,
): N[] {
  // A persistent invisible marker pins the region's slot; content always mounts before it.
  const marker = backend.createText('')
  backend.insert(parent, marker, initialAnchor)

  const nodes: N[] = [marker] // STABLE live array: content…, then marker (mutated in place)
  let cache = new Map<unknown, Entry<N, T>>() // insertion-ordered key → row
  let fallbackNodes: N[] = []
  let fallbackDispose: (() => void) | null = null

  const keyOf = region.key ?? ((item: T) => item as unknown)

  const removeNodes = (toRemove: readonly N[]): void => {
    // parentOf-guarded: a nested region's outer re-run may have already detached these.
    for (const node of toRemove) if (backend.parentOf(node)) backend.remove(parent, node)
  }
  const clearFallback = (): void => {
    if (fallbackDispose) {
      fallbackDispose()
      fallbackDispose = null
    }
    removeNodes(fallbackNodes)
    fallbackNodes = []
  }
  const disposeEntry = (entry: Entry<N, T>): void => {
    entry.dispose()
    removeNodes(entry.nodes)
  }
  const rebuildLiveNodes = (order: readonly Entry<N, T>[]): void => {
    nodes.length = 0
    for (const entry of order) nodes.push(...entry.nodes)
    nodes.push(marker)
  }

  // Authoritative teardown: dispose every row + the fallback + the marker (all guarded).
  onCleanup(() => {
    for (const entry of cache.values()) disposeEntry(entry)
    cache.clear()
    clearFallback()
    if (backend.parentOf(marker)) backend.remove(parent, marker)
  })

  effect(() => {
    const items = region.each() // the ONLY tracked read
    untrack(() => {
      batch(() => {
        const n = items.length

        // Validate keys up front — before ANY host mutation, so a bad list never half-moves.
        const keys: unknown[] = new Array(n)
        const seen = new Set<unknown>()
        for (let i = 0; i < n; i++) {
          const k = keyOf(items[i] as T, i)
          if (k === null || k === undefined) {
            throw new Error('For: key must not be null or undefined')
          }
          if (seen.has(k)) throw new Error(`For: duplicate key ${String(k)}`)
          seen.add(k)
          keys[i] = k
        }

        // Empty → dispose all rows, show the fallback (once) in the slot.
        if (n === 0) {
          for (const entry of cache.values()) disposeEntry(entry)
          cache.clear()
          const fallback = region.fallback
          if (fallback && !fallbackDispose) {
            fallbackNodes = createRoot((dispose) => {
              fallbackDispose = dispose
              return mountNode(fallback(), backend, parent, marker)
            })
          }
          rebuildLiveNodes([])
          return
        }
        clearFallback() // non-empty: never leave a stale fallback mounted

        // Record each surviving row's OLD position (insertion order) before we mutate the cache.
        const oldPos = new Map<Entry<N, T>, number>()
        let p = 0
        for (const entry of cache.values()) oldPos.set(entry, p++)

        // Build the new ordered rows: reuse on a key hit (patch signals), else create a root.
        const newCache = new Map<unknown, Entry<N, T>>()
        const order: Entry<N, T>[] = new Array(n)
        for (let i = 0; i < n; i++) {
          const k = keys[i]
          const existing = cache.get(k)
          if (existing) {
            existing.itemSig.set(items[i] as T) // Object.is-gated → a same-ref item is a no-op
            existing.indexSig.set(i)
            cache.delete(k) // whatever stays in `cache` after this loop was removed
            newCache.set(k, existing)
            order[i] = existing
          } else {
            const item = items[i] as T
            const captured = i
            const entry = createRoot<Entry<N, T>>((dispose) => {
              const itemSig = signal(item)
              const indexSig = signal(captured)
              const content = mountNode(
                region.mapFn(
                  () => itemSig(),
                  () => indexSig(),
                ),
                backend,
                parent,
                marker,
              )
              return { nodes: content, itemSig, indexSig, dispose }
            })
            newCache.set(k, entry)
            order[i] = entry
          }
        }

        // Dispose rows whose key disappeared (the leftovers in the old cache).
        for (const entry of cache.values()) disposeEntry(entry)

        // Minimal moves: the LIS of survivors' old positions is already correctly ordered and
        // stays put; everything else (created rows + out-of-order survivors) is inserted.
        const survivorOldPositions: number[] = []
        const survivorTargetIndex: number[] = []
        for (let i = 0; i < n; i++) {
          const op = oldPos.get(order[i] as Entry<N, T>)
          if (op !== undefined) {
            survivorOldPositions.push(op)
            survivorTargetIndex.push(i)
          }
        }
        const lis = longestIncreasingSubsequence(survivorOldPositions)
        const stable = new Set<number>()
        for (const idx of lis) stable.add(survivorTargetIndex[idx] as number)

        // Walk target order last → first; insert any non-stable row before the running anchor.
        let anchor: N = marker
        for (let i = n - 1; i >= 0; i--) {
          const entry = order[i] as Entry<N, T>
          if (!stable.has(i)) {
            for (const node of entry.nodes) backend.insert(parent, node, anchor)
          }
          if (entry.nodes.length > 0) anchor = entry.nodes[0] as N
        }

        cache = newCache
        rebuildLiveNodes(order)
      })
    })
  })

  return nodes
}
