/**
 * Errors for `@mindees/ai` (Synapse). Every failure carries a stable
 * {@link AiErrorCode} so callers can branch on the cause without string-matching.
 *
 * @module
 */

import type { StandardSchemaV1 } from './standard-schema'

/** Stable code identifying why an AI operation failed. */
export type AiErrorCode =
  /** No transport/fetch was provided to a backend that needs one. */
  | 'NO_TRANSPORT'
  /** The server returned a non-2xx status. */
  | 'HTTP_STATUS'
  /** A streaming response could not be parsed. */
  | 'STREAM_PARSE'
  /** Structured output failed schema validation (after repair attempts). */
  | 'INVALID_OBJECT'
  /** A tool-calling loop exceeded its step ceiling. */
  | 'MAX_STEPS'
  /** A tool handler threw. */
  | 'TOOL_FAILED'
  /** The request was aborted. */
  | 'ABORTED'
  /** An on-device / research-track capability is not implemented. */
  | 'NOT_IMPLEMENTED'

/** Optional structured detail attached to an {@link AiError}. */
export interface AiErrorOptions {
  /** Standard Schema issues — set on `INVALID_OBJECT` from schema validation. */
  readonly issues?: ReadonlyArray<StandardSchemaV1.Issue>
}

/** An AI error carrying a stable {@link AiErrorCode}. */
export class AiError extends Error {
  /** Stable, machine-readable cause. */
  readonly code: AiErrorCode
  /** Validation issues, when the failure came from schema validation. */
  readonly issues?: ReadonlyArray<StandardSchemaV1.Issue>

  constructor(code: AiErrorCode, message: string, options?: AiErrorOptions) {
    super(message)
    this.name = 'AiError'
    this.code = code
    // Set only when present (exactOptionalPropertyTypes-safe).
    if (options?.issues) this.issues = options.issues
  }
}
