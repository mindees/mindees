/**
 * Resilient AI calls — wrap any {@link AiBackend} so one-shot `generate` retries transient failures
 * (network blips, 429 rate limits, 5xx) with backoff. AI providers fail intermittently; this is the
 * battery you'd otherwise hand-roll. `sleep` is injectable, so retry logic is deterministically testable.
 *
 * Streaming passes through unwrapped: a failure mid-stream can't be safely resumed (chunks already
 * delivered), so callers handle stream errors themselves.
 *
 * @module
 */

import type { AiBackend, AiChunk, AiResult, GenerateRequest } from './contract'

/** Options for {@link withRetry}. */
export interface RetryOptions {
  /** Total attempts including the first (default 3; clamped to ≥ 1). */
  readonly maxAttempts?: number
  /**
   * Whether to retry after a failure. `attempt` is the number of failures so far (1 after the first).
   * Default: retry everything — pass a predicate to skip non-retryable errors (auth/validation).
   */
  readonly shouldRetry?: (error: unknown, attempt: number) => boolean
  /** Backoff before the next attempt, ms. Default: exponential `2^(attempt-1) * 200`, capped at 30s. */
  readonly backoffMs?: (attempt: number) => number
  /** Delay primitive (injectable for tests). Default: `setTimeout`-based (no-op where unavailable). */
  readonly sleep?: (ms: number) => Promise<void>
}

const defaultBackoff = (attempt: number): number => Math.min(30_000, 2 ** (attempt - 1) * 200)

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    // @mindees/ai targets a neutral runtime (no DOM lib); reach setTimeout off globalThis.
    const timer = (globalThis as { setTimeout?: (cb: () => void, ms: number) => unknown })
      .setTimeout
    if (ms > 0 && typeof timer === 'function') timer(() => resolve(), ms)
    else resolve()
  })

/** Wrap a backend so `generate` retries transient failures with backoff. `stream` is unchanged. */
export function withRetry(backend: AiBackend, options: RetryOptions = {}): AiBackend {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3)
  const shouldRetry = options.shouldRetry ?? (() => true)
  const backoffMs = options.backoffMs ?? defaultBackoff
  const sleep = options.sleep ?? defaultSleep
  return {
    async generate(request: GenerateRequest): Promise<AiResult> {
      let attempt = 0
      for (;;) {
        try {
          return await backend.generate(request)
        } catch (error) {
          attempt += 1
          if (attempt >= maxAttempts || !shouldRetry(error, attempt)) throw error
          await sleep(backoffMs(attempt))
        }
      }
    },
    // Mid-stream failures can't be safely resumed, so streaming passes through unwrapped.
    stream(request: GenerateRequest): AsyncIterable<AiChunk> {
      return backend.stream(request)
    },
  }
}
