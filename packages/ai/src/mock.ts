/**
 * A deterministic mock {@link AiBackend} — no network, no keys. The analog of
 * Continuum's in-memory hub: it powers all unit tests and lets apps run fully offline,
 * and is the working fallback that keeps the on-device research track honest.
 *
 * @module
 */

import type { AiBackend, AiChunk, AiResult, GenerateRequest, ToolCallPart, Usage } from './contract'
import { AiError } from './errors'

/** A scripted mock response: plain text, or a structured turn (e.g. emitting tool calls). */
export interface MockResponse {
  readonly text?: string
  readonly toolCalls?: readonly ToolCallPart[]
  readonly finishReason?: AiResult['finishReason']
  readonly usage?: Usage
}

/** One mock reply — a string (text only) or a {@link MockResponse}. */
export type MockReply = string | MockResponse

/** Options for {@link createMockBackend}. */
export interface MockBackendOptions {
  /** A fixed reply for every call. */
  readonly reply?: MockReply
  /** Sequential replies (call N uses `script[N]`; the last repeats once exhausted). */
  readonly script?: readonly MockReply[]
  /** Characters per streamed `text-delta`. Default 8. */
  readonly chunkSize?: number
}

/** Create a deterministic mock backend. */
export function createMockBackend(options: MockBackendOptions = {}): AiBackend {
  const chunkSize = Math.max(1, options.chunkSize ?? 8)
  let call = 0

  const replyFor = (): MockResponse => {
    let raw: MockReply | undefined
    if (options.script && options.script.length > 0) {
      raw = options.script[Math.min(call, options.script.length - 1)]
    } else {
      raw = options.reply
    }
    if (raw === undefined) return { text: '' }
    return typeof raw === 'string' ? { text: raw } : raw
  }
  const resultOf = (response: MockResponse): AiResult => {
    const text = response.text ?? ''
    const toolCalls = response.toolCalls
    const finishReason =
      response.finishReason ?? (toolCalls && toolCalls.length > 0 ? 'tool-calls' : 'stop')
    const usage = response.usage ?? { outputTokens: text.length }
    return toolCalls && toolCalls.length > 0
      ? { text, toolCalls, finishReason, usage }
      : { text, finishReason, usage }
  }
  const checkAborted = (request: GenerateRequest): void => {
    if (request.signal?.aborted) throw new AiError('ABORTED', 'request aborted')
  }

  return {
    async generate(request): Promise<AiResult> {
      checkAborted(request)
      const response = replyFor()
      call += 1
      return resultOf(response)
    },

    async *stream(request): AsyncIterable<AiChunk> {
      checkAborted(request)
      const response = replyFor()
      call += 1
      const text = response.text ?? ''
      for (let i = 0; i < text.length; i += chunkSize) {
        checkAborted(request) // honor cancellation between chunks
        yield { type: 'text-delta', delta: text.slice(i, i + chunkSize) }
      }
      // The mock emits tool-call chunks to cover the full AiChunk contract; the real server
      // streaming mappers do NOT yet parse tool-call deltas (runTools uses generate, not stream).
      for (const tc of response.toolCalls ?? []) {
        yield { type: 'tool-call', id: tc.id, name: tc.name, args: tc.args }
      }
      const finishReason =
        response.finishReason ??
        (response.toolCalls && response.toolCalls.length > 0 ? 'tool-calls' : 'stop')
      yield { type: 'finish', finishReason, usage: response.usage ?? { outputTokens: text.length } }
    },
  }
}
