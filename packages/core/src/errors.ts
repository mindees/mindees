/**
 * Thrown by APIs that are declared but not yet implemented (a "research track").
 *
 * Per the MindeesNative Working-Code Doctrine, a not-yet-built capability must
 * fail loudly and honestly rather than silently returning a fake value. This
 * error type makes that failure explicit, typed, and traceable to an RFC.
 */
export class NotImplementedError extends Error {
  override readonly name = 'NotImplementedError'

  /** Stable, machine-readable error code. */
  readonly code = 'ERR_MINDEES_NOT_IMPLEMENTED' as const

  /** The capability that is not implemented yet. */
  readonly feature: string

  /** Optional reference to the tracking RFC (e.g. `"RFC-0007"`). */
  readonly rfc?: string

  constructor(feature: string, options?: { readonly rfc?: string }) {
    const rfc = options?.rfc
    super(`${feature} is not implemented yet (research track).${rfc ? ` See ${rfc}.` : ''}`)
    this.feature = feature
    if (rfc !== undefined) {
      this.rfc = rfc
    }
    // Preserve the prototype chain so `instanceof` works reliably.
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
