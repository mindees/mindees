/**
 * MindeesNative reactivity — fine-grained, glitch-free, lazy signals.
 *
 * Algorithm: push–pull with graph coloring (`CLEAN` / `CHECK` / `DIRTY`), in the
 * lineage of SolidJS and the "reactively" library. A write *pushes* staleness
 * markers through the observer graph; a read *pulls*, recomputing a node only
 * when one of its sources actually changed. This guarantees:
 *
 * - **Glitch freedom** — no observer ever sees an inconsistent intermediate
 *   state (the classic diamond dependency recomputes its consumer exactly once).
 * - **No redundant recomputation** — a node recomputes at most once per change,
 *   and an equal recomputation does not propagate to its observers.
 * - **Deterministic, synchronous propagation** — effects run in a predictable
 *   order, batched to the end of the outermost write/batch.
 * - **Complete disposal** — disposing an owner unlinks every subscription, so
 *   there are no leaked observers.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

/**
 * A disposal scope. Computations and roots own the cleanups and child
 * computations created while they are the active owner; disposing an owner
 * tears all of them down.
 */
export interface Owner {
  /** Child computations created while this owner was active. */
  owned: AnyComputation[] | null
  /** Cleanup callbacks registered via {@link onCleanup}. */
  cleanups: Array<() => void> | null
}

// ---------------------------------------------------------------------------
// Node state
// ---------------------------------------------------------------------------

type State = 0 | 1 | 2 | 3
const CLEAN: State = 0
const CHECK: State = 1
const DIRTY: State = 2
const DISPOSED: State = 3

/** Equality comparator used to decide whether a value actually changed. */
export type EqualsFn<T> = (a: T, b: T) => boolean

const equalsDefault = (a: unknown, b: unknown): boolean => a === b

/**
 * The reactive graph is intentionally type-erased: a node may observe, and be
 * observed by, computations of unrelated value types. Internal graph links use
 * this alias; the public API (`Signal<T>` / `Memo<T>` / `Accessor<T>`) stays
 * fully typed.
 */
// biome-ignore lint/suspicious/noExplicitAny: type-erased reactive graph links
type AnyComputation = Computation<any>

// ---------------------------------------------------------------------------
// Globals (tracking + scheduling)
// ---------------------------------------------------------------------------

/** The computation currently executing, used for automatic dependency tracking. */
let currentObserver: AnyComputation | null = null
/** The active disposal scope for onCleanup / child registration. */
let currentOwner: Owner | null = null
/** Outstanding `batch()` nesting depth; effects flush when this returns to 0. */
let batchDepth = 0
/** Effects marked stale and awaiting a flush. */
const effectQueue: AnyComputation[] = []
/** Guard against re-entrant flushes. */
let flushing = false
/** Safety valve against accidental infinite reactive loops. */
const MAX_FLUSH_ITERATIONS = 100_000

/** @internal Test-only handle to a node behind an accessor. Not public API. */
export const NODE: unique symbol = Symbol('mindees.reactive.node')

interface WithNode<T> {
  [NODE]: Computation<T>
}

// ---------------------------------------------------------------------------
// Computation: the unit of reactivity (signal, computed, or effect)
// ---------------------------------------------------------------------------

class Computation<T> implements Owner {
  value: T
  fn: (() => T) | null
  state: State
  sources: AnyComputation[] | null = null
  observers: AnyComputation[] | null = null
  owned: AnyComputation[] | null = null
  cleanups: Array<() => void> | null = null
  equals: EqualsFn<T> | false
  readonly isEffect: boolean

  constructor(value: T, fn: (() => T) | null, equals: EqualsFn<T> | false, isEffect: boolean) {
    this.value = value
    this.fn = fn
    this.equals = equals
    this.isEffect = isEffect
    // Signals (no fn) start CLEAN; derivations start DIRTY so they compute lazily.
    this.state = fn ? DIRTY : CLEAN
  }

  /** Read the current value, tracking a dependency if a computation is running. */
  read(): T {
    if (this.state === DISPOSED) return this.value
    if (currentObserver) link(currentObserver, this)
    if (this.fn) this.updateIfNecessary()
    return this.value
  }

  /** Write a new value (signals only); pushes staleness to observers. */
  write(value: T): T {
    if (this.equals !== false && this.equals(this.value, value)) return this.value
    this.value = value
    if (this.observers) {
      for (const o of this.observers) o.markStale(DIRTY)
    }
    if (batchDepth === 0) flushEffects()
    return value
  }

  /** Color this node (and, transitively, its observers) as stale. */
  markStale(state: State): void {
    if (this.state < state) {
      const wasClean = this.state === CLEAN
      this.state = state
      if (this.isEffect && wasClean) effectQueue.push(this)
      if (this.observers) {
        for (const o of this.observers) o.markStale(CHECK)
      }
    }
  }

  /** Bring this node up to date, recomputing only if a source truly changed. */
  updateIfNecessary(): void {
    if (this.state === CLEAN || this.state === DISPOSED) return
    if (this.state === CHECK && this.sources) {
      for (const src of this.sources) {
        src.updateIfNecessary()
        if (this.state === DIRTY) break
      }
    }
    if (this.state === DIRTY) this.update()
    this.state = CLEAN
  }

  /** Recompute the derivation, re-tracking dependencies and notifying observers. */
  private update(): void {
    const oldValue = this.value
    disposeChildren(this)
    unlinkSources(this)

    const prevObserver = currentObserver
    const prevOwner = currentOwner
    currentObserver = this
    currentOwner = this
    try {
      // biome-ignore lint/style/noNonNullAssertion: update() only runs for derivations (fn != null).
      this.value = this.fn!()
    } finally {
      currentObserver = prevObserver
      currentOwner = prevOwner
    }

    const changed = this.equals === false || !this.equals(oldValue, this.value)
    if (changed && this.observers) {
      // Observers are already CHECK from the original push; promote them to DIRTY
      // so the in-flight pull recomputes them.
      for (const o of this.observers) {
        o.state = DIRTY
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Graph maintenance
// ---------------------------------------------------------------------------

function link(observer: AnyComputation, source: AnyComputation): void {
  if (observer.sources === null) observer.sources = []
  const sources = observer.sources
  if (!sources.includes(source)) {
    sources.push(source)
    if (source.observers === null) source.observers = []
    source.observers.push(observer)
  }
}

function unlinkSources(node: AnyComputation): void {
  if (!node.sources) return
  for (const src of node.sources) {
    const obs = src.observers
    if (!obs) continue
    const idx = obs.indexOf(node)
    if (idx >= 0) {
      const last = obs.pop()
      if (last && idx < obs.length) obs[idx] = last
    }
  }
  node.sources = null
}

function disposeChildren(owner: Owner): void {
  if (owner.owned) {
    for (const child of owner.owned) disposeComputation(child)
    owner.owned = null
  }
  if (owner.cleanups) {
    // Run every cleanup even if one throws, so a single faulty cleanup can't
    // strand the rest (or leak the owner). Collect failures and surface them
    // together afterward.
    const cleanups = owner.cleanups
    owner.cleanups = null
    const errors: unknown[] = []
    for (const c of cleanups) {
      try {
        c()
      } catch (err) {
        errors.push(err)
      }
    }
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) throw new AggregateError(errors, 'cleanup(s) threw')
  }
}

function disposeComputation(node: AnyComputation): void {
  if (node.state === DISPOSED) return
  disposeChildren(node)
  unlinkSources(node)
  node.observers = null
  node.state = DISPOSED
}

function adopt(node: AnyComputation): void {
  if (!currentOwner) return
  if (currentOwner.owned === null) currentOwner.owned = []
  currentOwner.owned.push(node)
}

// ---------------------------------------------------------------------------
// Effect scheduling
// ---------------------------------------------------------------------------

function flushEffects(): void {
  if (flushing) return
  flushing = true
  try {
    let i = 0
    let iterations = 0
    while (i < effectQueue.length) {
      if (++iterations > MAX_FLUSH_ITERATIONS) {
        effectQueue.length = 0
        throw new Error(
          'MindeesNative: potential infinite reactive loop detected while flushing effects.',
        )
      }
      const e = effectQueue[i]
      i++
      if (e && e.state !== CLEAN && e.state !== DISPOSED) e.updateIfNecessary()
    }
  } finally {
    effectQueue.length = 0
    flushing = false
  }
}

function attachNode<T, A extends object>(accessor: A, node: Computation<T>): A {
  ;(accessor as A & WithNode<T>)[NODE] = node
  return accessor
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** A read accessor for a derived/reactive value. */
export type Accessor<T> = () => T

/** Options accepted by {@link signal}. */
export interface SignalOptions<T> {
  /** Custom equality. `false` means "always notify" (every write propagates). */
  equals?: EqualsFn<T> | false
}

/** A writable reactive value: call to read; `.set`/`.update` to write. */
export interface Signal<T> {
  /** Read the value (tracks a dependency inside a computation). */
  (): T
  /** Replace the value; returns the new value. */
  set(value: T): T
  /** Update from the previous value; returns the new value. */
  update(fn: (prev: T) => T): T
  /** Read without tracking a dependency. */
  peek(): T
}

/** Options accepted by {@link computed}. */
export interface ComputedOptions<T> {
  /** Custom equality used to decide whether downstream observers re-run. */
  equals?: EqualsFn<T> | false
}

/** A memoized derived value: call to read; `.peek` to read without tracking. */
export interface Memo<T> {
  /** Read the (lazily recomputed) value, tracking a dependency. */
  (): T
  /** Read without tracking a dependency. */
  peek(): T
}

/**
 * Create a writable reactive value.
 *
 * @example
 * const count = signal(0)
 * count()        // read → 0
 * count.set(1)   // write
 * count.update(n => n + 1)
 */
export function signal<T>(value: T, options?: SignalOptions<T>): Signal<T> {
  const node = new Computation<T>(value, null, options?.equals ?? equalsDefault, false)
  const accessor = (() => node.read()) as Signal<T>
  accessor.set = (v: T) => node.write(v)
  accessor.update = (fn: (prev: T) => T) => node.write(fn(node.value))
  accessor.peek = () => node.value
  return attachNode(accessor, node)
}

/**
 * Create a memoized derived value. The function re-runs only when one of the
 * reactive values it reads has actually changed, and only when the result is
 * observed (lazy).
 *
 * @example
 * const doubled = computed(() => count() * 2)
 */
export function computed<T>(fn: () => T, options?: ComputedOptions<T>): Memo<T> {
  const node = new Computation<T>(undefined as T, fn, options?.equals ?? equalsDefault, false)
  adopt(node)
  const accessor = (() => node.read()) as Memo<T>
  accessor.peek = () => {
    node.updateIfNecessary()
    return node.value
  }
  return attachNode(accessor, node)
}

/** Alias of {@link computed}. */
export const memo = computed

/**
 * Run a side effect that re-runs whenever its reactive dependencies change.
 * Runs once immediately to establish dependencies.
 *
 * To clean up before each re-run and on disposal, either return a cleanup
 * function from the effect, or call {@link onCleanup}. Any non-function return
 * value is ignored (so expression-bodied effects like `() => list.push(x())`
 * are fine).
 *
 * @returns A disposer that stops the effect and runs its cleanups.
 *
 * @example
 * const stop = effect(() => console.log(count()))
 * stop() // unsubscribe
 *
 * @example
 * effect(() => {
 *   const id = setInterval(tick, 1000)
 *   return () => clearInterval(id) // cleanup
 * })
 */
export function effect(fn: () => void): () => void {
  const node = new Computation<void>(
    undefined,
    () => {
      const result: unknown = (fn as () => unknown)()
      if (typeof result === 'function') onCleanup(result as () => void)
    },
    false,
    true,
  )
  adopt(node)
  node.updateIfNecessary()
  return () => disposeComputation(node)
}

/**
 * Batch multiple writes so dependent effects run once, after the batch. Reads
 * inside a batch still observe the latest written values synchronously.
 */
export function batch<T>(fn: () => T): T {
  if (batchDepth > 0) return fn()
  batchDepth++
  try {
    return fn()
  } finally {
    batchDepth--
    flushEffects()
  }
}

/** Read reactive values without subscribing the current computation to them. */
export function untrack<T>(fn: () => T): T {
  const prev = currentObserver
  currentObserver = null
  try {
    return fn()
  } finally {
    currentObserver = prev
  }
}

/**
 * Register a cleanup to run before the owning computation re-runs and when it
 * is disposed. No-op outside a reactive scope.
 */
export function onCleanup(fn: () => void): void {
  if (!currentOwner) return
  if (currentOwner.cleanups === null) currentOwner.cleanups = []
  currentOwner.cleanups.push(fn)
}

/**
 * Create a non-tracked root scope that owns everything created within it. The
 * scope lives until the provided `dispose` function is called.
 *
 * @example
 * const dispose = createRoot((dispose) => {
 *   effect(() => console.log(count()))
 *   return dispose
 * })
 * dispose() // tear down the effect
 */
export function createRoot<T>(fn: (dispose: () => void) => T): T {
  const root: Owner = { owned: null, cleanups: null }
  const prevObserver = currentObserver
  const prevOwner = currentOwner
  currentObserver = null
  currentOwner = root
  try {
    return fn(() => disposeChildren(root))
  } finally {
    currentObserver = prevObserver
    currentOwner = prevOwner
  }
}

/** The current owner scope, or `null` outside any reactive scope. */
export function getOwner(): Owner | null {
  return currentOwner
}

/** Run `fn` with `owner` as the active scope (e.g. to re-attach cleanups). */
export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  const prev = currentOwner
  currentOwner = owner
  try {
    return fn()
  } finally {
    currentOwner = prev
  }
}

// ---------------------------------------------------------------------------
// Internal test helpers (exported from this module only — NOT from the package
// public entry point). Used to assert white-box invariants like leak-freedom.
// ---------------------------------------------------------------------------

/** @internal Number of live observers subscribed to the node behind `accessor`. */
export function _observerCount(accessor: object): number {
  const node = (accessor as Partial<WithNode<unknown>>)[NODE]
  return node?.observers?.length ?? 0
}

/** @internal Number of sources the node behind `accessor` depends on. */
export function _sourceCount(accessor: object): number {
  const node = (accessor as Partial<WithNode<unknown>>)[NODE]
  return node?.sources?.length ?? 0
}
