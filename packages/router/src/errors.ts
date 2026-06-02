/**
 * Router error types. A single {@link RouterError} carries a machine-readable
 * `code` (so callers can branch without string-matching messages) and, for
 * search-validation failures, the Standard Schema issues that caused it.
 *
 * @module
 */

import type { StandardSchemaV1 } from './standard-schema'

/** Machine-readable router error codes. */
export type RouterErrorCode =
  /** A path pattern was malformed (e.g. a catch-all that is not the last segment). */
  | 'INVALID_PATTERN'
  /** {@link buildPath} was called without a value for a required param. */
  | 'MISSING_PARAM'
  /** Search-param validation failed against the route's schema. */
  | 'VALIDATE_SEARCH'
  /**
   * A Standard Schema returned a `Promise`. Navigation-time parsing must be
   * synchronous, so async schemas are rejected.
   */
  | 'ASYNC_SCHEMA'

/** An error thrown by the Quantum router. */
export class RouterError extends Error {
  /** Machine-readable error code. */
  readonly code: RouterErrorCode
  /** Standard Schema issues, present only for `VALIDATE_SEARCH`. */
  readonly issues?: ReadonlyArray<StandardSchemaV1.Issue>

  constructor(
    code: RouterErrorCode,
    message: string,
    issues?: ReadonlyArray<StandardSchemaV1.Issue>,
  ) {
    super(message)
    this.name = 'RouterError'
    this.code = code
    if (issues !== undefined) this.issues = issues
  }
}
