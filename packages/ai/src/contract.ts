/**
 * The Synapse provider-agnostic AI contract — a small, hand-rolled, pure-TS surface
 * every backend (mock, server, on-device) implements. Streaming is `AsyncIterable`
 * only (no Web `ReadableStream`, no Node streams), so it runs on Node, browsers, and
 * Hermes/RN. See `docs/adr/0017-synapse-ai-contract.md`.
 *
 * @module
 */

/** Who authored a message. */
export type Role = 'system' | 'user' | 'assistant' | 'tool'

/** A plain text part. */
export interface TextPart {
  readonly type: 'text'
  readonly text: string
}

/** A model's request to call a tool (the args are model-produced ⇒ untrusted). */
export interface ToolCallPart {
  readonly type: 'tool-call'
  readonly id: string
  readonly name: string
  readonly args: unknown
}

/** The result of running a tool, fed back to the model. */
export interface ToolResultPart {
  readonly type: 'tool-result'
  readonly id: string
  readonly name: string
  readonly result: unknown
}

/** A piece of message content. */
export type Part = TextPart | ToolCallPart | ToolResultPart

/** One message in a conversation. */
export interface Message {
  readonly role: Role
  readonly content: string | readonly Part[]
}

/** Why a generation stopped. */
export type FinishReason = 'stop' | 'length' | 'tool-calls' | 'error'

/** Token usage, when the backend reports it. */
export interface Usage {
  readonly inputTokens?: number
  readonly outputTokens?: number
}

/** Minimal cancellation signal — a real `AbortSignal` is structurally compatible. */
export interface AbortLike {
  readonly aborted: boolean
}

/**
 * A tool the model may call, as sent to the backend (the **wire** shape — no `execute`).
 * `parameters` is a provider-native JSON Schema sent verbatim; the runtime-validating
 * {@link import('./tools').Tool} adds `execute` (+ an optional Standard Schema) on top.
 */
export interface ToolDefinition {
  readonly name: string
  readonly description?: string
  /** JSON Schema describing the arguments (sent to the provider as-is). */
  readonly parameters?: Record<string, unknown>
}

/** A one-shot or streaming generation request. */
export interface GenerateRequest {
  readonly messages: readonly Message[]
  /** 0–2-ish sampling temperature (backend-defined default). */
  readonly temperature?: number
  /** Cap on output tokens (backend-defined default). */
  readonly maxOutputTokens?: number
  /** Tools the model may call. A backend that can't express tools must throw, not drop them. */
  readonly tools?: readonly ToolDefinition[]
  /** Cancellation. */
  readonly signal?: AbortLike
}

/** The result of {@link AiBackend.generate}. */
export interface AiResult {
  readonly text: string
  readonly toolCalls?: readonly ToolCallPart[]
  readonly finishReason: FinishReason
  readonly usage?: Usage
}

/** One chunk of a streamed generation. */
export type AiChunk =
  | { readonly type: 'text-delta'; readonly delta: string }
  | {
      readonly type: 'tool-call'
      readonly id: string
      readonly name: string
      readonly args: unknown
    }
  | { readonly type: 'finish'; readonly finishReason: FinishReason; readonly usage?: Usage }

/** The single seam every backend implements (mock, server, on-device). */
export interface AiBackend {
  /** One-shot generation. */
  generate(request: GenerateRequest): Promise<AiResult>
  /** Streamed generation as an async iterable (throws `AiError` on failure). */
  stream(request: GenerateRequest): AsyncIterable<AiChunk>
}

/** The app-facing AI handle. */
export interface Ai {
  generate(request: GenerateRequest): Promise<AiResult>
  stream(request: GenerateRequest): AsyncIterable<AiChunk>
}

/** Wrap a {@link AiBackend} in the app-facing {@link Ai} handle. */
export function createAi(options: { readonly backend: AiBackend }): Ai {
  const { backend } = options
  return {
    generate: (request) => backend.generate(request),
    stream: (request) => backend.stream(request),
  }
}

/** Flatten a message's content to plain text (ignores non-text parts). */
export function messageText(message: Message): string {
  if (typeof message.content === 'string') return message.content
  return message.content
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join('')
}
