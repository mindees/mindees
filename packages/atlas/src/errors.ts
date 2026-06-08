/**
 * Errors for `@mindees/atlas`. Extends the shared {@link MindeesError} base, so a stable, machine-readable
 * {@link AtlasErrorCode} is available instead of string-matching messages (consistent with every other
 * `@mindees/*` package).
 *
 * @module
 */

import { MindeesError } from '@mindees/core'

/** Stable code identifying why an Atlas API rejected its input. */
export type AtlasErrorCode =
  /** A component prop was outside its valid range (e.g. a non-positive `List` itemHeight/height). */
  | 'INVALID_PROP'
  /** A Standard Schema returned a `Promise` where synchronous validation is required (e.g. `useForm`). */
  | 'ASYNC_SCHEMA'

/** An Atlas error carrying a stable {@link AtlasErrorCode}. */
export class AtlasError extends MindeesError {
  /** Stable, machine-readable cause (narrows {@link MindeesError.code}). */
  declare readonly code: AtlasErrorCode

  constructor(code: AtlasErrorCode, message: string) {
    super(code, message)
    this.name = 'AtlasError'
  }
}
