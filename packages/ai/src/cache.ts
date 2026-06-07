/**
 * Response caching for AI calls — wrap any {@link AiBackend} so identical one-shot `generate` requests
 * return a memoized result instead of re-hitting the provider (deterministic prompts, repeated renders,
 * dev loops). Cuts latency and token cost. Bounded (LRU eviction) with an optional TTL; `now` is
 * injectable so expiry is deterministically testable.
 *
 * Streaming passes through unwrapped (caching a stream is rarely what you want). Pairs with
 * {@link withRetry} — wrap `withCache(withRetry(backend))` to cache only successful results.
 *
 * @module
 */

import type { AiBackend, AiChunk, AiResult, GenerateRequest } from './contract'

/** Options for {@link withCache}. */
export interface CacheOptions {
  /** Max cached entries before least-recently-used eviction (default 100). */
  readonly maxEntries?: number
  /** Entry lifetime in ms; omit/0 = no expiry. */
  readonly ttlMs?: number
  /** Cache key for a request (default: stable JSON of the request). */
  readonly keyOf?: (request: GenerateRequest) => string
  /** Clock for TTL (injectable for tests; default `Date.now`). */
  readonly now?: () => number
}

interface Entry {
  readonly result: AiResult
  readonly expiresAt: number // Infinity when no TTL
}

const defaultNow = (): number => (globalThis as { Date?: { now(): number } }).Date?.now() ?? 0

/** Wrap a backend so identical `generate` requests are served from an LRU+TTL cache. */
export function withCache(backend: AiBackend, options: CacheOptions = {}): AiBackend {
  const maxEntries = Math.max(1, options.maxEntries ?? 100)
  const ttlMs = options.ttlMs ?? 0
  const keyOf = options.keyOf ?? ((request) => JSON.stringify(request))
  const now = options.now ?? defaultNow
  // Map preserves insertion order → re-insert on hit for LRU recency; oldest key is evicted first.
  const cache = new Map<string, Entry>()

  return {
    async generate(request: GenerateRequest): Promise<AiResult> {
      const key = keyOf(request)
      const hit = cache.get(key)
      if (hit && hit.expiresAt > now()) {
        cache.delete(key) // refresh recency
        cache.set(key, hit)
        return hit.result
      }
      if (hit) cache.delete(key) // expired
      const result = await backend.generate(request)
      cache.set(key, { result, expiresAt: ttlMs > 0 ? now() + ttlMs : Number.POSITIVE_INFINITY })
      if (cache.size > maxEntries) {
        const oldest = cache.keys().next().value
        if (oldest !== undefined) cache.delete(oldest)
      }
      return result
    },
    // Caching a stream is rarely desirable; pass through unwrapped.
    stream(request: GenerateRequest): AsyncIterable<AiChunk> {
      return backend.stream(request)
    },
  }
}
