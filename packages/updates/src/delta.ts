/**
 * Pure-TS differential (byte-level) delta codec for Pulse — ship only the bytes that
 * changed between two versions of an asset, instead of the whole file.
 *
 * Content-addressing (the {@link "./store".UpdateStorage}) already avoids
 * re-downloading **unchanged** files; this closes the common case of a *changed* file
 * (e.g. a multi-MB bundle edited by a few KB). The workload is asymmetric, so the API
 * is too:
 *
 * - {@link diff} runs **build/server-side** (slowness acceptable): a Rabin-Karp
 *   rolling-hash matcher emitting `COPY`/`INSERT` ops.
 * - {@link applyDelta} is the only **on-device** piece: a tight, allocation-bounded
 *   loop with no decompressor, byte-identical on Node, browsers, and Hermes/RN.
 *
 * The delta is itself a SHA-256-addressable blob, and the reconstructed result is
 * always hash-verified by the caller, so a bad or forged delta can never install
 * unverified bytes — it just wastes CPU and falls back to a full download. See
 * `docs/adr/0009-pulse-differential-diff.md`.
 *
 * Wire format: `[version:1][targetLength:varint][ op* ]`, each op a varint tag whose
 * low bit is the kind — `COPY = varint(len*2) + varint(zigzag(offset − expected))`,
 * `INSERT = varint(len*2 + 1) + len raw bytes`. Varints are unsigned LEB128 computed
 * with `%`/`Math.floor` (53-bit safe, not 32-bit bit-ops).
 *
 * @module
 */

import { UpdateError } from './errors'

/** Block size for the rolling-hash matcher, and therefore the minimum match length. */
const BLOCK_SIZE = 64
/** Delta wire-format version (first byte of every delta). */
const FORMAT_VERSION = 1
/** Default ceiling on a reconstructed target's size (anti-decompression-bomb): 256 MiB. */
const DEFAULT_MAX_BYTES = 256 * 1024 * 1024
/** Multiplier for the polynomial rolling hash (a prime; collisions are byte-confirmed). */
const HASH_BASE = 1000003

/** Zig-zag map a signed integer to a non-negative one (53-bit safe). */
function zigzag(n: number): number {
  return n >= 0 ? n * 2 : n * -2 - 1
}

/** Inverse of {@link zigzag}. */
function unzigzag(u: number): number {
  return u % 2 === 0 ? u / 2 : -(u + 1) / 2
}

/** A growable byte buffer with LEB128 varint + raw-range writers. */
class ByteWriter {
  private buf = new Uint8Array(1024)
  private len = 0

  private ensure(extra: number): void {
    if (this.len + extra <= this.buf.length) return
    let cap = this.buf.length
    while (cap < this.len + extra) cap *= 2
    const next = new Uint8Array(cap)
    next.set(this.buf.subarray(0, this.len))
    this.buf = next
  }

  byte(b: number): void {
    this.ensure(1)
    this.buf[this.len++] = b & 0xff
  }

  /** Write a non-negative integer (< 2^53) as an unsigned LEB128 varint. */
  varint(value: number): void {
    this.ensure(8)
    let v = value
    while (v >= 0x80) {
      this.buf[this.len++] = (v % 0x80) | 0x80
      v = Math.floor(v / 0x80)
    }
    this.buf[this.len++] = v
  }

  /** Append `src[start, end)` verbatim. */
  range(src: Uint8Array, start: number, end: number): void {
    const n = end - start
    this.ensure(n)
    this.buf.set(src.subarray(start, end), this.len)
    this.len += n
  }

  finish(): Uint8Array {
    return this.buf.slice(0, this.len)
  }
}

/** Polynomial hash of `buf[start, start+len)` (mod 2^32). Leading byte has the highest weight. */
function hashWindow(buf: Uint8Array, start: number, len: number): number {
  let h = 0
  for (let k = 0; k < len; k++) h = (Math.imul(h, HASH_BASE) + (buf[start + k] as number)) >>> 0
  return h
}

/** `HASH_BASE ^ exp` mod 2^32. */
function powMod(exp: number): number {
  let r = 1
  for (let i = 0; i < exp; i++) r = Math.imul(r, HASH_BASE) >>> 0
  return r
}

/** Roll a window hash forward by one byte: drop `outByte` (leading), add `inByte` (trailing). */
function rollHash(h: number, outByte: number, inByte: number, basePow: number): number {
  const removed = (h - Math.imul(outByte, basePow)) >>> 0
  return (Math.imul(removed, HASH_BASE) + inByte) >>> 0
}

/** Whether `a[ai, ai+len)` equals `b[bi, bi+len)`. */
function equalRange(a: Uint8Array, ai: number, b: Uint8Array, bi: number, len: number): boolean {
  for (let k = 0; k < len; k++) if (a[ai + k] !== b[bi + k]) return false
  return true
}

/**
 * Compute a delta that transforms `base` into `target`. Pure, deterministic, and
 * dependency-free. Intended for build/server-side use; the device only runs
 * {@link applyDelta}. The result always satisfies
 * `applyDelta(base, diff(base, target))` deep-equals `target`.
 */
export function diff(base: Uint8Array, target: Uint8Array): Uint8Array {
  const w = new ByteWriter()
  w.byte(FORMAT_VERSION)
  w.varint(target.length)

  const B = BLOCK_SIZE
  // No usable base blocks (or a tiny target) → the whole target is one INSERT.
  if (base.length < B || target.length < B) {
    if (target.length > 0) {
      w.varint(target.length * 2 + 1)
      w.range(target, 0, target.length)
    }
    return w.finish()
  }

  // Index non-overlapping B-byte base blocks by rolling hash.
  const index = new Map<number, number[]>()
  for (let i = 0; i + B <= base.length; i += B) {
    const h = hashWindow(base, i, B)
    const list = index.get(h)
    if (list) list.push(i)
    else index.set(h, [i])
  }
  const basePow = powMod(B - 1)

  let expected = 0 // base offset where a contiguous next copy would begin
  let pendingStart = 0 // start of the current run of unmatched (INSERT) target bytes
  let s = 0
  let h = hashWindow(target, 0, B)

  const flushInsert = (end: number): void => {
    if (end > pendingStart) {
      w.varint((end - pendingStart) * 2 + 1)
      w.range(target, pendingStart, end)
    }
  }

  while (s + B <= target.length) {
    const candidates = index.get(h)
    let matched = false
    if (candidates) {
      for (const o of candidates) {
        if (!equalRange(target, s, base, o, B)) continue // confirm — the hash may collide
        let len = B
        while (
          s + len < target.length &&
          o + len < base.length &&
          target[s + len] === base[o + len]
        ) {
          len++
        }
        // Extend left, reclaiming bytes from the pending INSERT run.
        let ss = s
        let oo = o
        while (ss > pendingStart && oo > 0 && target[ss - 1] === base[oo - 1]) {
          ss--
          oo--
          len++
        }
        flushInsert(ss)
        w.varint(len * 2) // COPY
        w.varint(zigzag(oo - expected))
        expected = oo + len
        s = ss + len
        pendingStart = s
        matched = true
        if (s + B <= target.length) h = hashWindow(target, s, B)
        break
      }
    }
    if (matched) continue
    const next = s + 1
    if (next + B <= target.length) {
      h = rollHash(h, target[s] as number, target[next + B - 1] as number, basePow)
    }
    s = next
  }
  flushInsert(target.length)
  return w.finish()
}

/** Options for {@link applyDelta}. */
export interface ApplyDeltaOptions {
  /** Reject a reconstructed target larger than this many bytes. Default 256 MiB. */
  readonly maxBytes?: number
}

/**
 * Apply a {@link diff} delta to `base`, reconstructing the target. The delta is
 * treated as **fully untrusted**: malformed input or any out-of-bounds COPY/INSERT
 * throws {@link UpdateError} (`DELTA_INVALID`) rather than reading out of range, and
 * the target length is capped (`maxBytes`) against a decompression-bomb. Callers must
 * still verify the returned bytes against the expected SHA-256.
 */
export function applyDelta(
  base: Uint8Array,
  delta: Uint8Array,
  options?: ApplyDeltaOptions,
): Uint8Array {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES
  let p = 0

  const readByte = (): number => {
    if (p >= delta.length) throw invalid('unexpected end of delta')
    return delta[p++] as number
  }
  const readVarint = (): number => {
    let result = 0
    let shift = 1
    let b: number
    do {
      b = readByte()
      result += (b & 0x7f) * shift
      shift *= 0x80
    } while (b >= 0x80)
    // Reject anything outside the 53-bit safe-integer range (a forged delta could
    // otherwise decode a length the rest of the contract can't reason about).
    if (!Number.isSafeInteger(result)) throw invalid('varint too large')
    return result
  }

  const version = readByte()
  if (version !== FORMAT_VERSION) throw invalid(`unsupported delta version ${version}`)
  const targetLen = readVarint()
  if (targetLen > maxBytes) throw invalid(`target length ${targetLen} exceeds max ${maxBytes}`)

  // Allocation can still fail above the cap (a large custom maxBytes, or a tight
  // Hermes/RN heap) — surface it as DELTA_INVALID, never a raw RangeError.
  let out: Uint8Array
  try {
    out = new Uint8Array(targetLen)
  } catch {
    throw invalid(`cannot allocate ${targetLen} bytes`)
  }
  let pos = 0
  let expected = 0
  while (p < delta.length) {
    const tag = readVarint()
    const kind = tag % 2
    const len = (tag - kind) / 2
    if (kind === 0) {
      const off = expected + unzigzag(readVarint())
      if (off < 0 || off + len > base.length) throw invalid('copy out of base bounds')
      if (pos + len > targetLen) throw invalid('copy overflows target')
      out.set(base.subarray(off, off + len), pos)
      pos += len
      expected = off + len
    } else {
      if (pos + len > targetLen) throw invalid('insert overflows target')
      if (p + len > delta.length) throw invalid('insert exceeds delta')
      out.set(delta.subarray(p, p + len), pos)
      p += len
      pos += len
    }
  }
  if (pos !== targetLen) throw invalid(`reconstructed ${pos} bytes, expected ${targetLen}`)
  return out
}

function invalid(detail: string): UpdateError {
  return new UpdateError('DELTA_INVALID', `invalid delta: ${detail}`)
}
