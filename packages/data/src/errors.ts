/**
 * Errors for `@mindees/data` (Continuum).
 *
 * Every failure carries a stable {@link DataErrorCode} so callers can branch on the
 * cause without string-matching messages.
 *
 * @module
 */

import { MindeesError } from '@mindees/core'

/** Stable code identifying why a Continuum operation failed. */
export type DataErrorCode =
  /** `insert` was given an id that already exists (use `upsert` to replace). */
  | 'DUPLICATE_ID'
  /** `update` referenced an id that is not in the collection. */
  | 'RECORD_NOT_FOUND'
  /** A mutation tried to change a record's `id` (ids are immutable). */
  | 'ID_IMMUTABLE'
  /** `optimistic()` was called inside another `optimistic()` block (not reentrant). */
  | 'OPTIMISTIC_NESTED'

/** A Continuum data error carrying a stable {@link DataErrorCode}. Extends {@link MindeesError}. */
export class DataError extends MindeesError {
  /** Stable, machine-readable cause (narrows {@link MindeesError.code}). */
  declare readonly code: DataErrorCode

  constructor(code: DataErrorCode, message: string) {
    super(code, message)
    this.name = 'DataError'
  }
}
