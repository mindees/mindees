/**
 * Structured output for Synapse: `generateObject` / `streamObject` produce a value validated
 * by any Standard Schema (Zod, Valibot, ArkType, …), built **purely on top of**
 * `AiBackend.generate` / `stream` — so the deterministic mock backend exercises the whole
 * path offline, and every backend (mock, server, on-device) gets structured output for free.
 *
 * Pipeline per attempt: prompt the model for JSON-only → extract a JSON value from the
 * (possibly decorated) text → sanitize against prototype-pollution/DoS → validate. On a
 * validation/extraction miss, re-ask with the concrete issues, up to a hard bound. No `eval`,
 * no vendor SDK, no JSON-Schema generation (Standard Schema has no introspection — describe
 * the desired shape in your own prompt). See `docs/adr/0019-synapse-structured-output.md`.
 *
 * @module
 */

import type { AiBackend, GenerateRequest, Message, Usage } from './contract'
import { AiError } from './errors'
import {
  containsForbiddenKey,
  DEFAULT_MAX_INPUT_CHARS,
  DEFAULT_SANITIZE_LIMITS,
  extractJson,
  formatIssues,
  lenientParseJson,
  type SanitizeLimits,
  sanitizeJson,
  validateStandard,
} from './json'
import type { StandardSchemaV1 } from './standard-schema'

/** The subset of a backend `generateObject` needs (one-shot generation). */
export type GeneratingBackend = Pick<AiBackend, 'generate'>
/** The subset of a backend `streamObject` needs (streamed generation). */
export type StreamingBackend = Pick<AiBackend, 'stream'>

/** Options for {@link generateObject}. */
export interface GenerateObjectOptions {
  /**
   * Maximum number of REPAIR re-asks after the first attempt (default `2`). Total model
   * calls = `1 + maxRepairs`.
   */
  readonly maxRepairs?: number
  /** Sanitization limits for the parsed value (defaults are generous-but-bounded). */
  readonly limits?: Partial<SanitizeLimits>
  /** Max characters of model text to parse per attempt (default ~8M). */
  readonly maxInputChars?: number
}

/** The result of {@link generateObject}. */
export interface GenerateObjectResult<T> {
  /** The validated, typed object. */
  readonly object: T
  /** Accumulated token usage across every attempt, when the backend reports it. */
  readonly usage?: Usage
  /** How many model calls were made (`1` on first-try success). */
  readonly attempts: number
}

const JSON_INSTRUCTION =
  'Respond with ONLY a single valid JSON value that matches the required schema. ' +
  'Do not include any prose, explanation, or markdown code fences.'

function withJsonInstruction(request: GenerateRequest): GenerateRequest {
  const instruction: Message = { role: 'system', content: JSON_INSTRUCTION }
  return { ...request, messages: [...request.messages, instruction] }
}

function repairRequest(
  base: GenerateRequest,
  failedText: string,
  problem: string,
): GenerateRequest {
  // Bounded history: always rebuild from `base` (which already carries the JSON instruction),
  // appending only the single last failure + a correction — never an ever-growing transcript.
  const assistant: Message = { role: 'assistant', content: failedText }
  const correction: Message = {
    role: 'user',
    content:
      `Your previous reply could not be used: ${problem}. ` +
      'Reply again with ONLY the corrected JSON — no prose, no code fences.',
  }
  return { ...base, messages: [...base.messages, assistant, correction] }
}

function mergeLimits(limits: Partial<SanitizeLimits> | undefined): SanitizeLimits | undefined {
  if (!limits) return undefined
  return { ...DEFAULT_SANITIZE_LIMITS, ...limits }
}

function addUsage(a: Usage | undefined, b: Usage | undefined): Usage | undefined {
  if (!a) return b
  if (!b) return a
  const sum: { inputTokens?: number; outputTokens?: number } = {}
  const input = (a.inputTokens ?? 0) + (b.inputTokens ?? 0)
  const output = (a.outputTokens ?? 0) + (b.outputTokens ?? 0)
  if (a.inputTokens !== undefined || b.inputTokens !== undefined) sum.inputTokens = input
  if (a.outputTokens !== undefined || b.outputTokens !== undefined) sum.outputTokens = output
  return sum
}

/**
 * Generate a value validated against `schema`, repairing up to `maxRepairs` times.
 *
 * @throws AiError `INVALID_OBJECT` if no valid object is produced within the bound (carrying
 * the last validation `issues`), or `ABORTED` if the signal is set between attempts.
 *
 * @example
 * const { object } = await generateObject(backend, { messages }, z.object({ title: z.string() }))
 */
export async function generateObject<S extends StandardSchemaV1>(
  backend: GeneratingBackend,
  request: GenerateRequest,
  schema: S,
  options: GenerateObjectOptions = {},
): Promise<GenerateObjectResult<StandardSchemaV1.InferOutput<S>>> {
  const maxRepairs = options.maxRepairs ?? 2
  const limits = mergeLimits(options.limits)
  const maxInputChars = options.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS
  const base = withJsonInstruction(request)

  let usage: Usage | undefined
  let attempt = 0
  let problem = ''
  let failedText = ''

  while (attempt <= maxRepairs) {
    if (request.signal?.aborted) throw new AiError('ABORTED', 'request aborted')
    const req = attempt === 0 ? base : repairRequest(base, failedText, problem)
    const result = await backend.generate(req)
    usage = addUsage(usage, result.usage)
    attempt++

    failedText = result.text
    const extracted = extractJson(result.text, maxInputChars)
    if (!extracted.ok) {
      problem = extracted.reason
      continue
    }
    // Sanitize BEFORE validate — throws INVALID_OBJECT on pollution/limits (not repaired).
    const clean = sanitizeJson(extracted.value, limits)
    const validation = await validateStandard(schema, clean)
    if (validation.ok) {
      return usage === undefined
        ? { object: validation.value, attempts: attempt }
        : { object: validation.value, usage, attempts: attempt }
    }
    problem = `schema validation failed: ${formatIssues(validation.issues)}`
    // Remember the issues for the final throw if this was the last attempt.
    if (attempt > maxRepairs) {
      throw new AiError('INVALID_OBJECT', problem, { issues: validation.issues })
    }
  }

  throw new AiError('INVALID_OBJECT', problem || 'no valid object produced')
}

/** A chunk emitted by {@link streamObject}. */
export type StreamObjectChunk<T> =
  /** A raw text delta from the underlying stream. */
  | { readonly type: 'text-delta'; readonly delta: string }
  /** A best-effort, UNVALIDATED, UNSANITIZED preview parsed from the partial text. */
  | { readonly type: 'partial-object'; readonly object: unknown; readonly validated: false }
  /** The final, sanitized + validated object (emitted once, at end of stream). */
  | { readonly type: 'object'; readonly object: T; readonly validated: true }

/** Options for {@link streamObject}. */
export interface StreamObjectOptions {
  /**
   * Emit best-effort `partial-object` previews as text streams in (default `false`). Previews
   * are UNVALIDATED and UNSANITIZED — treat them as untyped UI hints only; the single final
   * `object` chunk is the validated value.
   */
  readonly partial?: boolean
  /** Sanitization limits for the final value. */
  readonly limits?: Partial<SanitizeLimits>
  /** Max characters to accumulate before failing with `INVALID_OBJECT` (default ~8M). */
  readonly maxInputChars?: number
}

/**
 * Stream a structured object: passes raw `text-delta`s through, optionally emits unvalidated
 * `partial-object` previews, and validates the fully-assembled value EXACTLY ONCE at the end
 * (no mid-stream repair — a stream can't be un-sent).
 *
 * @throws AiError `INVALID_OBJECT` if the final value fails extraction/validation, or
 * `ABORTED` if the signal is set during streaming.
 */
export async function* streamObject<S extends StandardSchemaV1>(
  backend: StreamingBackend,
  request: GenerateRequest,
  schema: S,
  options: StreamObjectOptions = {},
): AsyncIterable<StreamObjectChunk<StandardSchemaV1.InferOutput<S>>> {
  const limits = mergeLimits(options.limits)
  const maxInputChars = options.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS
  const base = withJsonInstruction(request)
  let text = ''

  for await (const chunk of backend.stream(base)) {
    if (request.signal?.aborted) throw new AiError('ABORTED', 'request aborted')
    if (chunk.type === 'text-delta') {
      text += chunk.delta
      if (text.length > maxInputChars) {
        throw new AiError('INVALID_OBJECT', `stream exceeds ${maxInputChars} characters`)
      }
      yield { type: 'text-delta', delta: chunk.delta }
      // Throttle previews to structural closes (when a value/structure may have completed) to
      // avoid re-parsing the whole buffer on every token, and skip a preview carrying a poison
      // key so a naive consumer merge can't be weaponized.
      if (options.partial && (chunk.delta.includes('}') || chunk.delta.includes(']'))) {
        const preview = lenientParseJson(text, maxInputChars)
        if (preview !== undefined && !containsForbiddenKey(preview)) {
          yield { type: 'partial-object', object: preview, validated: false }
        }
      }
    }
  }

  if (request.signal?.aborted) throw new AiError('ABORTED', 'request aborted')
  const extracted = extractJson(text, maxInputChars)
  if (!extracted.ok) throw new AiError('INVALID_OBJECT', extracted.reason)
  const clean = sanitizeJson(extracted.value, limits)
  const validation = await validateStandard(schema, clean)
  if (!validation.ok) {
    throw new AiError(
      'INVALID_OBJECT',
      `schema validation failed: ${formatIssues(validation.issues)}`,
      {
        issues: validation.issues,
      },
    )
  }
  yield { type: 'object', object: validation.value, validated: true }
}
