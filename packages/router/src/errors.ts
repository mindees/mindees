/**
 * Router error types. A single {@link RouterError} carries a machine-readable
 * `code` (so callers can branch without string-matching messages) and, for
 * search-validation failures, the Standard Schema issues that caused it.
 *
 * @module
 */

import { MindeesError } from '@mindees/core'
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
  /** A `useRouter`/`useParams`/… hook ran with no active router (no router has rendered yet). */
  | 'NO_ACTIVE_ROUTER'

/** An error thrown by the Quantum router. Extends {@link MindeesError}. */
export class RouterError extends MindeesError {
  /** Machine-readable error code (narrows {@link MindeesError.code}). */
  declare readonly code: RouterErrorCode
  /** Standard Schema issues, present only for `VALIDATE_SEARCH`. */
  readonly issues?: ReadonlyArray<StandardSchemaV1.Issue>

  constructor(
    code: RouterErrorCode,
    message: string,
    issues?: ReadonlyArray<StandardSchemaV1.Issue>,
  ) {
    super(code, message)
    this.name = 'RouterError'
    if (issues !== undefined) this.issues = issues
  }
}
