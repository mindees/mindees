/**
 * Synapse dev-time intelligence — a **build/dev-only** error explainer over the same AI
 * contract. `explainError` turns a thrown error into a structured, actionable explanation via
 * {@link generateObject}, so it works against any backend (the deterministic mock in tests, a
 * server backend in a CLI). Exported from the `@mindees/ai/devtools` subpath to signal intent:
 * this is for your toolchain, not the device bundle (don't ship it into a running app). See
 * `docs/adr/0021-synapse-devtools.md`.
 *
 * @module
 */

import type { AbortLike, AiBackend, GenerateRequest, Message } from './contract'
import { generateObject } from './object'
import type { StandardSchemaV1 } from './standard-schema'

/** A normalized error to explain (a plain object, or pass an `Error` directly). */
export interface ExplainInput {
  readonly message: string
  readonly stack?: string
  readonly code?: string | number
}

/** Options for {@link explainError}. */
export interface ExplainOptions {
  /** Language/runtime hint, e.g. `'TypeScript'` / `'Node 24'`. */
  readonly language?: string
  /** Relevant source around the error, included verbatim in the prompt. */
  readonly codeContext?: string
  /** Repair re-asks if the model's JSON is malformed (default `1`). */
  readonly maxRepairs?: number
  /** Cancellation. */
  readonly signal?: AbortLike
}

/** A structured explanation of an error. */
export interface ErrorExplanation {
  /** One- or two-sentence plain-language summary of what went wrong. */
  readonly summary: string
  /** Most likely causes, most-likely first. */
  readonly likelyCauses: readonly string[]
  /** Concrete, ordered suggested fixes. */
  readonly suggestedFixes: readonly string[]
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
}

// A lenient Standard Schema: requires a `summary` string; coerces the two arrays (a model may
// omit them). Validated through the same sanitize→validate pipeline as any structured output.
const explanationSchema: StandardSchemaV1<unknown, ErrorExplanation> = {
  '~standard': {
    version: 1,
    vendor: 'mindees-devtools',
    validate: (value) => {
      const o =
        typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
      const summary = typeof o?.summary === 'string' && o.summary.length > 0 ? o.summary : undefined
      if (summary === undefined) {
        return { issues: [{ message: 'summary must be a non-empty string', path: ['summary'] }] }
      }
      return {
        value: {
          summary,
          likelyCauses: toStringArray(o?.likelyCauses),
          suggestedFixes: toStringArray(o?.suggestedFixes),
        },
      }
    },
  },
}

function normalize(error: Error | ExplainInput): ExplainInput {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code
    return {
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
      ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
    }
  }
  return error
}

/**
 * Explain an error using the model behind `backend`, returning a validated
 * {@link ErrorExplanation}. Built on {@link generateObject} (prompt → extract → sanitize →
 * validate → bounded repair), so it runs offline against the mock and live against a server.
 *
 * @throws AiError `INVALID_OBJECT` if the model can't produce a usable explanation in the
 * repair budget, or `ABORTED` on cancellation.
 */
export async function explainError(
  backend: Pick<AiBackend, 'generate'>,
  error: Error | ExplainInput,
  options: ExplainOptions = {},
): Promise<ErrorExplanation> {
  const input = normalize(error)
  const prompt = [
    'You are a senior debugging assistant for TypeScript/JavaScript applications.',
    'Explain the error below and how to fix it — be concrete and concise.',
    options.language ? `Language/runtime: ${options.language}.` : '',
    `Error message: ${input.message}`,
    input.code !== undefined ? `Error code: ${input.code}` : '',
    input.stack ? `Stack trace:\n${input.stack}` : '',
    options.codeContext ? `Relevant code:\n${options.codeContext}` : '',
    'Reply as JSON: { "summary": string, "likelyCauses": string[], "suggestedFixes": string[] }.',
  ]
    .filter(Boolean)
    .join('\n')

  const message: Message = { role: 'user', content: prompt }
  const request: GenerateRequest = {
    messages: [message],
    ...(options.signal ? { signal: options.signal } : {}),
  }
  const result = await generateObject(backend, request, explanationSchema, {
    maxRepairs: options.maxRepairs ?? 1,
  })
  return result.object
}

/** Render an {@link ErrorExplanation} as readable terminal text. */
export function formatExplanation(explanation: ErrorExplanation): string {
  const lines: string[] = [`Summary: ${explanation.summary}`]
  if (explanation.likelyCauses.length > 0) {
    lines.push('', 'Likely causes:')
    for (const cause of explanation.likelyCauses) lines.push(`  • ${cause}`)
  }
  if (explanation.suggestedFixes.length > 0) {
    lines.push('', 'Suggested fixes:')
    for (const fix of explanation.suggestedFixes) lines.push(`  • ${fix}`)
  }
  return lines.join('\n')
}
