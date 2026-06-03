/**
 * Hybrid Logical Clock (HLC) — the causality primitive for Continuum.
 *
 * An {@link Hlc} pairs physical wall-clock milliseconds with a logical counter (and the
 * replica's `nodeId`), so it tracks real time closely yet guarantees a **monotonic,
 * total causal order** across replicas with no coordinator (Kulkarni et al.). The
 * physical clock is **injected**, so behavior is fully deterministic in tests.
 *
 * 10C tags every field write with an `Hlc` (its per-field LWW merge key); 10D ships ops
 * ordered by it. See `docs/adr/0013-continuum-hlc-causality.md`.
 *
 * @module
 */

/** A Hybrid Logical Clock timestamp. */
export interface Hlc {
  /** Physical wall-clock milliseconds. */
  readonly wallMs: number
  /** Logical counter that breaks ties when `wallMs` does not advance. */
  readonly counter: number
  /** The replica that produced this timestamp. */
  readonly nodeId: string
}

/** Options for {@link createClock}. */
export interface ClockOptions {
  /** This replica's stable id (must be unique per replica). */
  readonly nodeId: string
  /** Injected physical clock in ms. Default `() => Date.now()`. */
  readonly now?: () => number
  /**
   * Reject a received timestamp whose wall clock is more than this far ahead of ours
   * (a corrupt/hostile peer must not be able to push our clock arbitrarily forward).
   * Default 24h.
   */
  readonly maxClockDriftMs?: number
}

/** Max counter value that fits the encoded fixed width; overflow rolls into `wallMs`. */
const MAX_COUNTER = 999_999
const WALL_WIDTH = 15
const COUNTER_WIDTH = 6
/** Largest `wallMs` the fixed-width encoding can represent (~year 33658). */
const MAX_WALL = 10 ** WALL_WIDTH - 1

/** A per-replica Hybrid Logical Clock. */
export interface Clock {
  /** Produce a timestamp for a new local event (or an outgoing message). */
  tick(): Hlc
  /** Merge a received timestamp; returns the new local timestamp (strictly greater than both). */
  update(remote: Hlc): Hlc
  /** The current local timestamp without advancing the clock. */
  peek(): Hlc
}

/** Create a {@link Clock} for `nodeId`. */
export function createClock(options: ClockOptions): Clock {
  const { nodeId } = options
  const physical = options.now ?? (() => Date.now())
  const maxDriftMs = options.maxClockDriftMs ?? 24 * 60 * 60 * 1000
  let wallMs = 0
  let counter = 0

  // Commit (wall, candidateCounter), rolling a logical-counter overflow into wall time
  // so the counter stays within its fixed encoding width while monotonicity holds.
  const commit = (w: number, c: number): Hlc => {
    if (c > MAX_COUNTER) {
      wallMs = w + 1
      counter = 0
    } else {
      wallMs = w
      counter = c
    }
    return { wallMs, counter, nodeId }
  }

  return {
    tick(): Hlc {
      const pt = physical()
      return pt > wallMs ? commit(pt, 0) : commit(wallMs, counter + 1)
    },

    update(remote: Hlc): Hlc {
      const pt = physical()
      // Validate untrusted input: a malformed or far-future remote must not poison this clock.
      if (
        !Number.isInteger(remote.wallMs) ||
        remote.wallMs < 0 ||
        remote.wallMs > pt + maxDriftMs
      ) {
        throw new TypeError(`remote HLC wallMs out of bounds: ${remote.wallMs}`)
      }
      if (!Number.isInteger(remote.counter) || remote.counter < 0 || remote.counter > MAX_COUNTER) {
        throw new TypeError(`remote HLC counter out of bounds: ${remote.counter}`)
      }
      const w = Math.max(wallMs, remote.wallMs, pt)
      let c: number
      if (w === wallMs && w === remote.wallMs) c = Math.max(counter, remote.counter) + 1
      else if (w === wallMs) c = counter + 1
      else if (w === remote.wallMs) c = remote.counter + 1
      else c = 0
      return commit(w, c)
    },

    peek(): Hlc {
      return { wallMs, counter, nodeId }
    },
  }
}

/** Total order over {@link Hlc}: by `wallMs`, then `counter`, then `nodeId`. */
export function compareHlc(a: Hlc, b: Hlc): -1 | 0 | 1 {
  if (a.wallMs !== b.wallMs) return a.wallMs < b.wallMs ? -1 : 1
  if (a.counter !== b.counter) return a.counter < b.counter ? -1 : 1
  if (a.nodeId !== b.nodeId) return a.nodeId < b.nodeId ? -1 : 1
  return 0
}

/**
 * Encode an {@link Hlc} as a **lexicographically-sortable** string
 * (`wallMs:counter:nodeId`, zero-padded), so plain string sort matches
 * {@link compareHlc}. Throws if a field exceeds its fixed width (which would silently
 * break the sort order) — the clock keeps both within range, so this only fires on a
 * hand-built/decoded out-of-range value. Inverse of {@link decodeHlc}.
 */
export function encodeHlc(hlc: Hlc): string {
  if (!Number.isInteger(hlc.wallMs) || hlc.wallMs < 0 || hlc.wallMs > MAX_WALL) {
    throw new RangeError(`HLC wallMs out of encodable range: ${hlc.wallMs}`)
  }
  if (!Number.isInteger(hlc.counter) || hlc.counter < 0 || hlc.counter > MAX_COUNTER) {
    throw new RangeError(`HLC counter out of encodable range: ${hlc.counter}`)
  }
  const wall = String(hlc.wallMs).padStart(WALL_WIDTH, '0')
  const counter = String(hlc.counter).padStart(COUNTER_WIDTH, '0')
  return `${wall}:${counter}:${hlc.nodeId}`
}

const DIGITS = /^\d+$/

/** Decode a string produced by {@link encodeHlc} (a `nodeId` may itself contain `:`). */
export function decodeHlc(encoded: string): Hlc {
  const first = encoded.indexOf(':')
  const second = encoded.indexOf(':', first + 1)
  if (first === -1 || second === -1) {
    throw new TypeError(`invalid encoded HLC: ${encoded}`)
  }
  const wall = encoded.slice(0, first)
  const counter = encoded.slice(first + 1, second)
  if (!DIGITS.test(wall) || !DIGITS.test(counter)) {
    throw new TypeError(`invalid encoded HLC numeric field: ${encoded}`)
  }
  return { wallMs: Number(wall), counter: Number(counter), nodeId: encoded.slice(second + 1) }
}
