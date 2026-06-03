/**
 * Errors for `@mindees/data` (Continuum).
 *
 * Every failure carries a stable {@link DataErrorCode} so callers can branch on the
 * cause without string-matching messages.
 *
 * @module
 */

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

/** A Continuum data error carrying a stable {@link DataErrorCode}. */
export class DataError extends Error {
  /** Stable, machine-readable cause. */
  readonly code: DataErrorCode

  constructor(code: DataErrorCode, message: string) {
    super(message)
    this.name = 'DataError'
    this.code = code
  }
}
