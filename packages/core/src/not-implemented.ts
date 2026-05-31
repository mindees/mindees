import { NotImplementedError } from './errors'

/**
 * Throw a {@link NotImplementedError} for a not-yet-built capability.
 *
 * The `never` return type documents at the type level that this function never
 * returns normally, so call sites type-check without bogus fallbacks.
 *
 * @param feature - Human-readable name of the unimplemented capability.
 * @param options - Optional metadata, e.g. the tracking RFC.
 */
export function notImplemented(feature: string, options?: { readonly rfc?: string }): never {
  throw new NotImplementedError(feature, options)
}
