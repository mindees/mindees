/**
 * Per-provider wire mappers (OpenAI-compatible + Anthropic), isolating the HTTP shape so
 * the server backend never imports a vendor SDK and a provider change is a contained
 * edit. All response/stream parsing is defensive — model/server JSON is untrusted. Tool
 * mapping is added in 11C (with tools). See `docs/adr/0018-synapse-server-backend.md`.
 *
 * @module
 */

import {
  type AiChunk,
  type AiResult,
  type FinishReason,
  type GenerateRequest,
  messageText,
  type Usage,
} from './contract'

/** Parse one SSE `data` JSON into a chunk, or `null` to skip (non-content events). */
export type StreamParser = (data: unknown) => AiChunk | null

/** A provider wire mapper. */
export interface ProviderMapper {
  /** Build the HTTP path + JSON body for a request. */
  buildRequest(
    request: GenerateRequest,
    model: string,
    stream: boolean,
  ): { path: string; body: unknown }
  /** Parse a non-streaming JSON response into an {@link AiResult}. */
  parseResponse(json: unknown): AiResult
  /**
   * Create a {@link StreamParser} for one stream. Returned fresh per stream so it may hold
   * per-stream state (e.g. the last `finish_reason`) without leaking across concurrent
   * streams that share this mapper singleton.
   */
  createStreamParser(): StreamParser
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
/** Build a {@link Usage} omitting undefined fields (exactOptionalPropertyTypes-safe). */
function usageOf(inputTokens?: number, outputTokens?: number): Usage {
  const usage: { inputTokens?: number; outputTokens?: number } = {}
  if (inputTokens !== undefined) usage.inputTokens = inputTokens
  if (outputTokens !== undefined) usage.outputTokens = outputTokens
  return usage
}

// null-prototype maps so an untrusted finish_reason like 'toString'/'__proto__' reads as
// undefined (→ the 'stop' fallback) rather than leaking an inherited member.
const OPENAI_FINISH: Record<string, FinishReason> = Object.assign(Object.create(null), {
  stop: 'stop',
  length: 'length',
  tool_calls: 'tool-calls',
})
const ANTHROPIC_FINISH: Record<string, FinishReason> = Object.assign(Object.create(null), {
  end_turn: 'stop',
  max_tokens: 'length',
  tool_use: 'tool-calls',
})

/** OpenAI-compatible `/chat/completions` mapper (also fits many local/compatible servers). */
export const openaiMapper: ProviderMapper = {
  buildRequest(request, model, stream) {
    const body: Record<string, unknown> = {
      model,
      stream,
      messages: request.messages.map((m) => ({ role: m.role, content: messageText(m) })),
    }
    if (request.temperature !== undefined) body.temperature = request.temperature
    if (request.maxOutputTokens !== undefined) body.max_tokens = request.maxOutputTokens
    if (stream) body.stream_options = { include_usage: true }
    return { path: '/chat/completions', body }
  },
  parseResponse(json) {
    const root = asRecord(json)
    const choice = asRecord((root?.choices as unknown[] | undefined)?.[0])
    const message = asRecord(choice?.message)
    const usage = asRecord(root?.usage)
    return {
      text: asString(message?.content) ?? '',
      finishReason: OPENAI_FINISH[asString(choice?.finish_reason) ?? ''] ?? 'stop',
      usage: usageOf(asNumber(usage?.prompt_tokens), asNumber(usage?.completion_tokens)),
    }
  },
  createStreamParser() {
    // With stream_options.include_usage, OpenAI sends usage on a trailing choices:[] chunk
    // that carries NO finish_reason. Remember the last real finish_reason so the
    // usage-bearing finish reports the true reason instead of a fabricated 'stop'.
    let lastReason: FinishReason = 'stop'
    return (data) => {
      const root = asRecord(data)
      const choice = asRecord((root?.choices as unknown[] | undefined)?.[0])
      const delta = asString(asRecord(choice?.delta)?.content)
      if (delta) return { type: 'text-delta', delta }
      const finish = asString(choice?.finish_reason)
      if (finish) lastReason = OPENAI_FINISH[finish] ?? 'stop'
      const usage = asRecord(root?.usage)
      // Emit a finish for a finish_reason chunk OR the trailing usage-only chunk, so
      // streamed usage isn't lost — both carry the last-seen reason.
      if (finish || usage) {
        return {
          type: 'finish',
          finishReason: lastReason,
          usage: usageOf(asNumber(usage?.prompt_tokens), asNumber(usage?.completion_tokens)),
        }
      }
      return null
    }
  },
}

/** Anthropic `/v1/messages` mapper. */
export const anthropicMapper: ProviderMapper = {
  buildRequest(request, model, stream) {
    const system = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => messageText(m))
      .join('\n')
    const messages = request.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: messageText(m) }))
    const body: Record<string, unknown> = {
      model,
      stream,
      messages,
      max_tokens: request.maxOutputTokens ?? 1024, // required by Anthropic
    }
    if (system) body.system = system
    if (request.temperature !== undefined) body.temperature = request.temperature
    return { path: '/v1/messages', body }
  },
  parseResponse(json) {
    const root = asRecord(json)
    const content = (root?.content as unknown[] | undefined) ?? []
    const text = content.map((part) => asString(asRecord(part)?.text) ?? '').join('')
    const usage = asRecord(root?.usage)
    return {
      text,
      finishReason: ANTHROPIC_FINISH[asString(root?.stop_reason) ?? ''] ?? 'stop',
      usage: usageOf(asNumber(usage?.input_tokens), asNumber(usage?.output_tokens)),
    }
  },
  createStreamParser() {
    // Anthropic's message_delta carries stop_reason and usage together, so this parser is
    // stateless — but it's still created per stream to satisfy the contract.
    return (data) => {
      const root = asRecord(data)
      const type = asString(root?.type)
      if (type === 'content_block_delta') {
        const delta = asString(asRecord(root?.delta)?.text)
        return delta ? { type: 'text-delta', delta } : null
      }
      if (type === 'message_delta') {
        const stop = asString(asRecord(root?.delta)?.stop_reason)
        const usage = asRecord(root?.usage)
        return {
          type: 'finish',
          finishReason: ANTHROPIC_FINISH[stop ?? ''] ?? 'stop',
          usage: usageOf(undefined, asNumber(usage?.output_tokens)),
        }
      }
      return null
    }
  },
}

/** The built-in mappers by adapter name. */
export const MAPPERS = { openai: openaiMapper, anthropic: anthropicMapper } as const

/** A built-in provider adapter name. */
export type AdapterName = keyof typeof MAPPERS
