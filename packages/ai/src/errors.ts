/**
 * Errors for `@mindees/ai` (Synapse). Every failure carries a stable
 * {@link AiErrorCode} so callers can branch on the cause without string-matching.
 *
 * @module
 */

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

/** An AI error carrying a stable {@link AiErrorCode}. */
export class AiError extends Error {
  /** Stable, machine-readable cause. */
  readonly code: AiErrorCode

  constructor(code: AiErrorCode, message: string) {
    super(message)
    this.name = 'AiError'
    this.code = code
  }
}
