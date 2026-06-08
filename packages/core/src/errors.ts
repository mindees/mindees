/**
 * The shared error base for the whole `@mindees/*` family.
 *
 * Every framework error extends {@link MindeesError}, so a consumer can catch any of them with one
 * `instanceof MindeesError` and branch on a stable, machine-readable {@link MindeesError.code} — instead of
 * string-matching `.message` (which is not part of the semver contract). Package errors narrow `code` to
 * their own union (e.g. `AiErrorCode`) via `declare readonly code: …`, so the precise codes stay typed.
 */
export class MindeesError extends Error {
  /** Stable, machine-readable cause code (SCREAMING_SNAKE, e.g. `'ROUTER_NO_MATCH'`). Part of the API. */
  readonly code: string

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MindeesError'
    this.code = code
    // Preserve the prototype chain so `instanceof` works reliably when subclassing the built-in `Error`.
    // `new.target` makes this correct for every subclass too.
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Thrown by APIs that are declared but not yet implemented (a "research track").
 *
 * Per the MindeesNative Working-Code Doctrine, a not-yet-built capability must
 * fail loudly and honestly rather than silently returning a fake value. This
 * error type makes that failure explicit, typed, and traceable to an RFC.
 */
export class NotImplementedError extends MindeesError {
  override readonly name = 'NotImplementedError'

  /** Stable, machine-readable error code. */
  declare readonly code: 'ERR_MINDEES_NOT_IMPLEMENTED'

  /** The capability that is not implemented yet. */
  readonly feature: string

  /** Optional reference to the tracking RFC (e.g. `"RFC-0007"`). */
  readonly rfc?: string

  constructor(feature: string, options?: { readonly rfc?: string }) {
    const rfc = options?.rfc
    super(
      'ERR_MINDEES_NOT_IMPLEMENTED',
      `${feature} is not implemented yet (research track).${rfc ? ` See ${rfc}.` : ''}`,
    )
    this.feature = feature
    if (rfc !== undefined) {
      this.rfc = rfc
    }
  }
}
