/**
 * Search (query) params — parsing, serializing, and **typed, validated** access.
 *
 * Search params are first-class typed state in Quantum. A route declares a
 * {@link StandardSchemaV1} schema; reads are validated and fully typed via
 * {@link StandardSchemaV1.InferOutput}. This is the capability Expo Router and
 * React Router lack (they return raw, untyped strings). See ADR-0003.
 *
 * Conventions:
 * - repeated keys (`?tag=a&tag=b`) parse to a `string[]`; single keys to a `string`;
 * - coercion (string → number/boolean/date) is delegated to the schema
 *   (e.g. `z.coerce.number()`), so this module never guesses types.
 *
 * @module
 */

import { RouterError } from './errors'
import type { StandardSchemaV1 } from './standard-schema'

/** A value accepted when serializing a query string. */
export type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ReadonlyArray<string | number | boolean>

/**
 * Parse a query string into a record. Accepts an optional leading `?`. Repeated
 * keys collapse into an array, preserving order.
 *
 * @example
 * parseQuery('?page=2&tag=a&tag=b') // { page: '2', tag: ['a', 'b'] }
 */
export function parseQuery(search: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  const query = search.startsWith('?') ? search.slice(1) : search
  if (query.length === 0) return out

  for (const pair of query.split('&')) {
    if (pair.length === 0) continue
    const eq = pair.indexOf('=')
    const rawKey = eq === -1 ? pair : pair.slice(0, eq)
    const rawValue = eq === -1 ? '' : pair.slice(eq + 1)
    const key = safeDecode(rawKey)
    const value = safeDecode(rawValue)

    const existing = out[key]
    if (existing === undefined) {
      out[key] = value
    } else if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      out[key] = [existing, value]
    }
  }
  return out
}

/**
 * Serialize a record into a query string (no leading `?`). `null`/`undefined`
 * values are skipped; arrays emit one `key=value` pair each. Keys are sorted for
 * deterministic, cache-friendly output.
 *
 * @example
 * stringifyQuery({ page: 2, tag: ['a', 'b'] }) // 'page=2&tag=a&tag=b'
 */
export function stringifyQuery(query: Record<string, QueryValue>): string {
  const parts: string[] = []
  for (const key of Object.keys(query).sort()) {
    const value = query[key]
    if (value === null || value === undefined) continue
    const encKey = encodeURIComponent(key)
    if (Array.isArray(value)) {
      for (const item of value) parts.push(`${encKey}=${encodeURIComponent(String(item))}`)
    } else {
      parts.push(`${encKey}=${encodeURIComponent(String(value))}`)
    }
  }
  return parts.join('&')
}

/** The result of a non-throwing validation. */
export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: ReadonlyArray<StandardSchemaV1.Issue> }

/**
 * Validate `input` against a Standard Schema, **without throwing** on invalid
 * input — returns a discriminated result. Throws {@link RouterError}
 * (`ASYNC_SCHEMA`) only for the programming error of passing an async schema,
 * since navigation-time parsing must be synchronous.
 */
export function safeValidateSearch<S extends StandardSchemaV1>(
  schema: S,
  input: unknown,
): ValidationResult<StandardSchemaV1.InferOutput<S>> {
  const result = schema['~standard'].validate(input)
  if (result instanceof Promise) {
    throw new RouterError(
      'ASYNC_SCHEMA',
      'Asynchronous schemas are not supported for synchronous search-param validation.',
    )
  }
  // Discriminate on `issues` (truthiness): a schema may legitimately yield a
  // success value of `undefined`, so `value` is not a reliable discriminant.
  if (result.issues) {
    return { ok: false, issues: result.issues }
  }
  return { ok: true, value: result.value }
}

/**
 * Validate `input` against a Standard Schema, returning the typed output or
 * throwing {@link RouterError} (`VALIDATE_SEARCH` with the issues, or
 * `ASYNC_SCHEMA`).
 *
 * @example
 * const schema = z.object({ page: z.coerce.number() }) // Zod, Valibot, ArkType…
 * validateSearch(schema, { page: '2' }) // { page: 2 }
 */
export function validateSearch<S extends StandardSchemaV1>(
  schema: S,
  input: unknown,
): StandardSchemaV1.InferOutput<S> {
  const result = safeValidateSearch(schema, input)
  if (!result.ok) {
    throw new RouterError('VALIDATE_SEARCH', formatIssues(result.issues), result.issues)
  }
  return result.value
}

/** Render Standard Schema issues into a single readable message. */
function formatIssues(issues: ReadonlyArray<StandardSchemaV1.Issue>): string {
  const lines = issues.map((issue) => {
    const path = issue.path?.map((seg) => (typeof seg === 'object' ? seg.key : seg)).join('.')
    return path ? `${path}: ${issue.message}` : issue.message
  })
  return `Search validation failed: ${lines.join('; ')}`
}

/** Decode a URI component, falling back to the raw value on malformed input. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return value
  }
}
