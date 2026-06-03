/**
 * A deterministic mock {@link AiBackend} — no network, no keys. The analog of
 * Continuum's in-memory hub: it powers all unit tests and lets apps run fully offline,
 * and is the working fallback that keeps the on-device research track honest.
 *
 * @module
 */

import type { AiBackend, AiChunk, AiResult, GenerateRequest } from './contract'
import { AiError } from './errors'

/** Options for {@link createMockBackend}. */
export interface MockBackendOptions {
  /** A fixed reply for every call. */
  readonly reply?: string
  /** Sequential replies (call N uses `script[N]`; the last repeats once exhausted). */
  readonly script?: readonly string[]
  /** Characters per streamed `text-delta`. Default 8. */
  readonly chunkSize?: number
}

/** Create a deterministic mock backend. */
export function createMockBackend(options: MockBackendOptions = {}): AiBackend {
  const chunkSize = Math.max(1, options.chunkSize ?? 8)
  let call = 0

  const replyFor = (): string => {
    if (options.script && options.script.length > 0) {
      const index = Math.min(call, options.script.length - 1)
      return options.script[index] ?? ''
    }
    return options.reply ?? ''
  }
  const checkAborted = (request: GenerateRequest): void => {
    if (request.signal?.aborted) throw new AiError('ABORTED', 'request aborted')
  }

  return {
    async generate(request): Promise<AiResult> {
      checkAborted(request)
      const text = replyFor()
      call += 1
      return { text, finishReason: 'stop', usage: { outputTokens: text.length } }
    },

    async *stream(request): AsyncIterable<AiChunk> {
      checkAborted(request)
      const text = replyFor()
      call += 1
      for (let i = 0; i < text.length; i += chunkSize) {
        checkAborted(request) // honor cancellation between chunks
        yield { type: 'text-delta', delta: text.slice(i, i + chunkSize) }
      }
      yield { type: 'finish', finishReason: 'stop', usage: { outputTokens: text.length } }
    },
  }
}
