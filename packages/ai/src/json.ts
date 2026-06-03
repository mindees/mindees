/**
 * Pure, no-`eval` JSON helpers shared by structured output (`object.ts`) and the
 * tool-calling loop (`tools.ts`): extracting a JSON value from decorated model text,
 * sanitizing untrusted parsed data against prototype-pollution + DoS, validating through a
 * Standard Schema, and formatting validation issues. Model output is untrusted — every
 * function here is fail-closed. See `docs/adr/0019-synapse-structured-output.md`.
 *
 * @module
 */

import { AiError } from './errors'
import type { StandardSchemaV1 } from './standard-schema'

/** Keys that must never appear in untrusted parsed objects (prototype-pollution vectors). */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Max characters of untrusted model text handed to `JSON.parse`. A size gate enforced BEFORE
 * parsing (mirrors the SSE backend's `MAX_SSE_BUFFER`) so a hostile payload can't be fully
 * allocated before the post-parse limits in {@link sanitizeJson} would reject it. ~8M chars.
 */
export const DEFAULT_MAX_INPUT_CHARS = 8 * 1024 * 1024

/** Limits that bound a sanitized value so hostile model JSON can't exhaust memory. */
export interface SanitizeLimits {
  /** Max nesting depth. */
  readonly maxDepth: number
  /** Max total nodes (objects + arrays + primitives) across the whole value. */
  readonly maxNodes: number
  /** Max length of any single string. */
  readonly maxStringLength: number
  /** Max own keys on any single object. */
  readonly maxProps: number
}

/** Generous-but-bounded defaults (structured output can be larger than an SDUI tree). */
export const DEFAULT_SANITIZE_LIMITS: SanitizeLimits = {
  maxDepth: 64,
  maxNodes: 100_000,
  maxStringLength: 1_000_000,
  maxProps: 1000,
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The outcome of {@link extractJson}. */
export type ExtractResult =
  | { readonly ok: true; readonly value: unknown }
  | {
      readonly ok: false
      readonly reason: string
    }

function tryParse(text: string): ExtractResult {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, reason: 'not valid JSON' }
  }
}

/**
 * Find the content of the first fenced code block (```` ```json ```` or bare ```` ``` ````),
 * or `undefined` if there is no closed fence. Locates the fence with `indexOf` only — the
 * inner content is handed to `JSON.parse`, never to a regex or `eval`.
 */
function fencedBlock(text: string): string | undefined {
  const open = text.indexOf('```')
  if (open === -1) return undefined
  // Skip the opening fence and an optional language tag up to the end of that line.
  const afterFence = open + 3
  const newline = text.indexOf('\n', afterFence)
  if (newline === -1) return undefined
  const close = text.indexOf('```', newline + 1)
  if (close === -1) return undefined
  return text.slice(newline + 1, close)
}

/**
 * Scan for the first balanced `{…}` or `[…]` span, tracking string + escape state so braces
 * inside string literals don't miscount. Returns the substring or `undefined`. Linear, no
 * regex, no `eval`.
 */
function firstBalancedSpan(text: string): string | undefined {
  let start = -1
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{' || ch === '[') {
      start = i
      break
    }
  }
  if (start === -1) return undefined
  const stack: string[] = []
  let inStr = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === '}' || ch === ']') {
      stack.pop()
      if (stack.length === 0) return text.slice(start, i + 1)
    }
  }
  return undefined
}

/**
 * Extract a JSON value from model text, trying in a fixed, testable order:
 * 1. parse the whole (trimmed) text; 2. parse the first fenced code block; 3. parse the
 * first balanced brace/bracket span. Never uses a capturing regex or `eval`.
 */
export function extractJson(
  text: string,
  maxChars: number = DEFAULT_MAX_INPUT_CHARS,
): ExtractResult {
  // Size gate BEFORE any JSON.parse so a hostile payload isn't fully allocated first.
  if (text.length > maxChars) {
    return { ok: false, reason: `input exceeds ${maxChars} characters` }
  }
  const direct = tryParse(text.trim())
  if (direct.ok) return direct

  const fenced = fencedBlock(text)
  if (fenced !== undefined) {
    const parsed = tryParse(fenced.trim())
    if (parsed.ok) return parsed
  }

  const span = firstBalancedSpan(text)
  if (span !== undefined) {
    const parsed = tryParse(span)
    if (parsed.ok) return parsed
  }

  return { ok: false, reason: 'no valid JSON value found in model output' }
}

/**
 * Best-effort parse of *incomplete* JSON for streaming previews: closes any open string and
 * unbalanced brackets, drops a dangling `,`/`:`, and parses. Returns `undefined` whenever it
 * can't safely produce a value (never throws, never guesses a value token). The result is
 * **unvalidated and unsanitized** — callers must treat it as an untyped preview only.
 */
export function lenientParseJson(
  text: string,
  maxChars: number = DEFAULT_MAX_INPUT_CHARS,
): unknown {
  if (text.length > maxChars) return undefined
  let start = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{' || text[i] === '[') {
      start = i
      break
    }
  }
  if (start === -1) return undefined

  const stack: string[] = []
  let inStr = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === '}' || ch === ']') stack.pop()
  }

  let candidate = text.slice(start)
  if (inStr) candidate += '"'
  // Drop trailing whitespace then a single dangling structural char (e.g. `{"a":` or `[1,`).
  let end = candidate.length
  while (end > 0) {
    const c = candidate[end - 1]
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t') end--
    else break
  }
  if (end > 0 && (candidate[end - 1] === ',' || candidate[end - 1] === ':')) end--
  candidate = candidate.slice(0, end)
  for (let i = stack.length - 1; i >= 0; i--) candidate += stack[i]

  try {
    return JSON.parse(candidate)
  } catch {
    return undefined
  }
}

/**
 * Deep-clone untrusted parsed JSON into a fresh value, throwing `AiError('INVALID_OBJECT')`
 * on any prototype-pollution key (`__proto__`/`constructor`/`prototype`) at any depth or on
 * any limit breach. Run this BEFORE handing a value to a Standard Schema validator — a
 * validator can itself pollute the prototype by touching a poisoned object.
 */
export function sanitizeJson(
  value: unknown,
  limits: SanitizeLimits = DEFAULT_SANITIZE_LIMITS,
): unknown {
  let nodes = 0
  const walk = (v: unknown, depth: number): unknown => {
    if (depth > limits.maxDepth) {
      throw new AiError('INVALID_OBJECT', `value exceeds max depth ${limits.maxDepth}`)
    }
    if (++nodes > limits.maxNodes) {
      throw new AiError('INVALID_OBJECT', `value exceeds max nodes ${limits.maxNodes}`)
    }
    if (v === null) return null
    const t = typeof v
    if (t === 'string') {
      if ((v as string).length > limits.maxStringLength) {
        throw new AiError('INVALID_OBJECT', `string exceeds max length ${limits.maxStringLength}`)
      }
      return v
    }
    if (t === 'number') {
      if (!Number.isFinite(v)) throw new AiError('INVALID_OBJECT', 'numbers must be finite')
      return v
    }
    if (t === 'boolean') return v
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1))
    if (isPlainObject(v)) {
      const keys = Object.keys(v)
      if (keys.length > limits.maxProps) {
        throw new AiError('INVALID_OBJECT', `object exceeds max keys ${limits.maxProps}`)
      }
      const out: Record<string, unknown> = {}
      for (const k of keys) {
        if (FORBIDDEN_KEYS.has(k)) throw new AiError('INVALID_OBJECT', `forbidden key "${k}"`)
        out[k] = walk(v[k], depth + 1)
      }
      return out
    }
    throw new AiError('INVALID_OBJECT', `unsupported value of type ${t}`)
  }
  return walk(value, 0)
}

/**
 * Cheap recursive check for any prototype-pollution own key, WITHOUT cloning. Used to skip
 * emitting an unsanitized streaming preview that carries a poison key (so a consumer who
 * naively deep-merges the preview can't be tricked into polluting the prototype).
 */
export function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenKey)
  if (isPlainObject(value)) {
    for (const k of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(k)) return true
      if (containsForbiddenKey(value[k])) return true
    }
  }
  return false
}

/** Render Standard Schema issues into one readable line: `path: message; path2: message2`. */
export function formatIssues(issues: ReadonlyArray<StandardSchemaV1.Issue>): string {
  const list: ReadonlyArray<StandardSchemaV1.Issue> = Array.isArray(issues) ? issues : []
  const lines = list.map((issue) => {
    // String()-coerce each segment: a path key may be a symbol (PropertyKey), and
    // `Array.join`'s implicit coercion throws on symbols — that must not escape the pipeline.
    const path = issue.path
      ?.map((seg) => String(typeof seg === 'object' && seg !== null ? seg.key : seg))
      .join('.')
    return path ? `${path}: ${issue.message}` : issue.message
  })
  return lines.join('; ')
}

/** A normalized validation outcome (sync — the Promise has already been awaited). */
export type ValidationOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: ReadonlyArray<StandardSchemaV1.Issue> }

/**
 * Validate a (already-sanitized) value through a Standard Schema, awaiting an async validator.
 * Defensively narrows a malformed validator result (non-array `issues`) into a failure rather
 * than crashing. Discriminates on `issues` truthiness — a valid output may legitimately be
 * `undefined`, so `value` is not a reliable discriminant.
 */
export async function validateStandard<S extends StandardSchemaV1>(
  schema: S,
  value: unknown,
): Promise<ValidationOutcome<StandardSchemaV1.InferOutput<S>>> {
  const raw = schema['~standard'].validate(value)
  const result = raw instanceof Promise ? await raw : raw
  if (result.issues) {
    return { ok: false, issues: Array.isArray(result.issues) ? result.issues : [] }
  }
  return { ok: true, value: result.value }
}
