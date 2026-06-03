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
  type Message,
  messageText,
  type Part,
  type ToolCallPart,
  type ToolResultPart,
  type Usage,
} from './contract'

/** Parse one SSE `data` JSON into a chunk, or `null` to skip (non-content events). */
export type StreamParser = (data: unknown) => AiChunk | null

/**
 * A provider wire mapper. A custom mapper whose `buildRequest` cannot express
 * `request.tools` MUST throw rather than silently drop them (the built-in openai/anthropic
 * mappers serialize them; the on-device backend throws).
 */
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

/** Parse OpenAI's `function.arguments` (a JSON STRING) defensively into a value. */
function parseJsonArgs(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? {}
  try {
    return JSON.parse(value)
  } catch {
    return {} // a malformed arg string becomes empty args — the loop's validator rejects it
  }
}

/** Serialize a tool result to the string the wire APIs expect (never throws, cycle-safe-ish). */
function toWireString(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/** Split a message's parts (string content has only text). */
function partsOf(content: string | readonly Part[]): {
  text: string
  calls: ToolCallPart[]
  results: ToolResultPart[]
} {
  if (typeof content === 'string') return { text: content, calls: [], results: [] }
  const text = content
    .filter((p): p is Extract<Part, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('')
  const calls = content.filter((p): p is ToolCallPart => p.type === 'tool-call')
  const results = content.filter((p): p is ToolResultPart => p.type === 'tool-result')
  return { text, calls, results }
}

/**
 * Serialize messages to the OpenAI chat shape, round-tripping tool turns: an assistant turn
 * with tool calls emits `tool_calls`; a `tool` message emits one `{ role:'tool', tool_call_id }`
 * per result. Without this the tool loop's 2nd turn would lose its tool context.
 */
function openaiMessages(messages: readonly Message[]): unknown[] {
  const out: unknown[] = []
  for (const m of messages) {
    const { text, calls, results } = partsOf(m.content)
    if (results.length > 0) {
      for (const r of results)
        out.push({ role: 'tool', tool_call_id: r.id, content: toWireString(r.result) })
    } else if (calls.length > 0) {
      out.push({
        role: m.role,
        content: text || null,
        tool_calls: calls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
        })),
      })
    } else {
      out.push({ role: m.role, content: text })
    }
  }
  return out
}

/**
 * Serialize non-system messages to the Anthropic shape, round-tripping tool turns: assistant
 * tool calls become `tool_use` blocks; a `tool` message becomes a USER message of `tool_result`
 * blocks (Anthropic carries tool results in the user turn).
 */
function anthropicMessages(messages: readonly Message[]): unknown[] {
  const out: unknown[] = []
  for (const m of messages) {
    if (m.role === 'system') continue // folded into the top-level `system` field
    const { text, calls, results } = partsOf(m.content)
    if (results.length > 0) {
      out.push({
        role: 'user',
        content: results.map((r) => ({
          type: 'tool_result',
          tool_use_id: r.id,
          content: toWireString(r.result),
        })),
      })
    } else if (calls.length > 0) {
      const content: unknown[] = []
      if (text) content.push({ type: 'text', text })
      for (const c of calls)
        content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args ?? {} })
      out.push({ role: 'assistant', content })
    } else {
      out.push({ role: m.role, content: text })
    }
  }
  return out
}

/** Add `toolCalls` to an {@link AiResult} only when present (exactOptionalPropertyTypes-safe). */
function withToolCalls(result: AiResult, toolCalls: ToolCallPart[]): AiResult {
  return toolCalls.length > 0 ? { ...result, toolCalls } : result
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
      messages: openaiMessages(request.messages),
    }
    if (request.temperature !== undefined) body.temperature = request.temperature
    if (request.maxOutputTokens !== undefined) body.max_tokens = request.maxOutputTokens
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          ...(t.description !== undefined ? { description: t.description } : {}),
          parameters: t.parameters ?? { type: 'object', properties: {} },
        },
      }))
    }
    if (stream) body.stream_options = { include_usage: true }
    return { path: '/chat/completions', body }
  },
  parseResponse(json) {
    const root = asRecord(json)
    const choice = asRecord((root?.choices as unknown[] | undefined)?.[0])
    const message = asRecord(choice?.message)
    const usage = asRecord(root?.usage)
    const toolCalls: ToolCallPart[] = []
    for (const raw of (message?.tool_calls as unknown[] | undefined) ?? []) {
      const tc = asRecord(raw)
      const fn = asRecord(tc?.function)
      const name = asString(fn?.name)
      if (!name) continue
      toolCalls.push({
        type: 'tool-call',
        id: asString(tc?.id) ?? name,
        name,
        args: parseJsonArgs(fn?.arguments),
      })
    }
    return withToolCalls(
      {
        text: asString(message?.content) ?? '',
        finishReason: OPENAI_FINISH[asString(choice?.finish_reason) ?? ''] ?? 'stop',
        usage: usageOf(asNumber(usage?.prompt_tokens), asNumber(usage?.completion_tokens)),
      },
      toolCalls,
    )
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
    const messages = anthropicMessages(request.messages)
    const body: Record<string, unknown> = {
      model,
      stream,
      messages,
      max_tokens: request.maxOutputTokens ?? 1024, // required by Anthropic
    }
    if (system) body.system = system
    if (request.temperature !== undefined) body.temperature = request.temperature
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        name: t.name,
        ...(t.description !== undefined ? { description: t.description } : {}),
        input_schema: t.parameters ?? { type: 'object', properties: {} },
      }))
    }
    return { path: '/v1/messages', body }
  },
  parseResponse(json) {
    const root = asRecord(json)
    const content = (root?.content as unknown[] | undefined) ?? []
    let text = ''
    const toolCalls: ToolCallPart[] = []
    for (const part of content) {
      const block = asRecord(part)
      if (asString(block?.type) === 'tool_use') {
        const name = asString(block?.name)
        if (!name) continue
        toolCalls.push({
          type: 'tool-call',
          id: asString(block?.id) ?? name,
          name,
          args: block?.input ?? {},
        })
      } else {
        text += asString(block?.text) ?? ''
      }
    }
    const usage = asRecord(root?.usage)
    return withToolCalls(
      {
        text,
        finishReason: ANTHROPIC_FINISH[asString(root?.stop_reason) ?? ''] ?? 'stop',
        usage: usageOf(asNumber(usage?.input_tokens), asNumber(usage?.output_tokens)),
      },
      toolCalls,
    )
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
