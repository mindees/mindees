/**
 * Route patterns — matching, building, and **codegen-free** typed params.
 *
 * A pattern is a `/`-separated path where each segment is one of:
 * - a **static** segment (`posts`) — matches itself literally;
 * - a **dynamic** segment (`:postId`) — matches exactly one non-empty segment;
 * - a **catch-all** segment (`:rest*`) — must be last; matches the remaining
 *   segments (zero or more), joined with `/`.
 *
 * This mirrors the manifest paths emitted by `@mindees/compiler`
 * (`buildRouteManifest`: `[param]` → `:param`, `[...rest]` → `:rest*`).
 *
 * The headline win over Expo Router / React Router: params are typed by parsing
 * the pattern string with **template-literal types** ({@link PathParams}) — no
 * generated `.d.ts`, no dev server, and required params are typed as *required*
 * (not optional). See ADR-0003.
 *
 * @module
 */

import { RouterError } from './errors'

// ---------------------------------------------------------------------------
// Type-level: infer params from a pattern string
// ---------------------------------------------------------------------------

/** Flatten an intersection of object types into a single readable object type. */
type Prettify<T> = { [K in keyof T]: T[K] } & {}

/** The param contributed by a single pattern segment. */
type SegmentParam<Seg extends string> = Seg extends `:${infer Name}*`
  ? { [K in Name]: string }
  : Seg extends `:${infer Name}`
    ? { [K in Name]: string }
    : // biome-ignore lint/complexity/noBannedTypes: empty object = "this segment adds no params"
      {}

/** Split a pattern on `/` into a tuple of segments. */
type SplitSegments<P extends string> = P extends `${infer Head}/${infer Tail}`
  ? [Head, ...SplitSegments<Tail>]
  : [P]

/** Intersect the param contributions of every segment. */
type MergeSegments<Segs extends readonly string[]> = Segs extends [
  infer Head extends string,
  ...infer Tail extends string[],
]
  ? SegmentParam<Head> & MergeSegments<Tail>
  : // biome-ignore lint/complexity/noBannedTypes: base case = no params
    {}

/**
 * The params object for a pattern, inferred at the type level.
 *
 * @example
 * type A = PathParams<'/posts/:postId'>       // { postId: string }
 * type B = PathParams<'/files/:rest*'>        // { rest: string }
 * type C = PathParams<'/about'>               // {}
 * type D = PathParams<'/u/:userId/p/:postId'> // { userId: string; postId: string }
 */
export type PathParams<P extends string> = Prettify<MergeSegments<SplitSegments<P>>>

/** Whether a pattern has any dynamic params (used to make params required vs optional). */
export type HasPathParams<P extends string> = keyof PathParams<P> extends never ? false : true

// ---------------------------------------------------------------------------
// Runtime: parse, match, build
// ---------------------------------------------------------------------------

interface Segment {
  readonly kind: 'static' | 'param' | 'catchAll'
  /** Static text, or the param name. */
  readonly value: string
}

/** Split a pathname into non-empty segments (tolerates leading/trailing slashes). */
function splitPath(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0)
}

/**
 * Parse a pattern into segments, validating it. Throws {@link RouterError}
 * (`INVALID_PATTERN`) if a catch-all is not the final segment.
 */
export function parsePattern(pattern: string): Segment[] {
  const raw = splitPath(pattern)
  const segments: Segment[] = raw.map((s) => {
    if (s.startsWith(':') && s.endsWith('*')) {
      return { kind: 'catchAll', value: s.slice(1, -1) }
    }
    if (s.startsWith(':')) {
      return { kind: 'param', value: s.slice(1) }
    }
    return { kind: 'static', value: s }
  })
  const catchAllIndex = segments.findIndex((s) => s.kind === 'catchAll')
  if (catchAllIndex !== -1 && catchAllIndex !== segments.length - 1) {
    throw new RouterError(
      'INVALID_PATTERN',
      `Catch-all segment must be last in pattern "${pattern}".`,
    )
  }
  return segments
}

/**
 * Match a `pathname` against a `pattern`. Returns the extracted params, or
 * `null` if it does not match. Param values are URI-decoded.
 *
 * @example
 * matchPattern('/posts/:id', '/posts/42')   // { id: '42' }
 * matchPattern('/files/:rest*', '/files/a/b') // { rest: 'a/b' }
 * matchPattern('/about', '/contact')        // null
 */
export function matchPattern(pattern: string, pathname: string): Record<string, string> | null {
  const segments = parsePattern(pattern)
  const parts = splitPath(pathname)
  const params: Record<string, string> = {}

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    // `seg` is always defined for i < length; the cast satisfies noUncheckedIndexedAccess.
    if (seg === undefined) return null
    if (seg.kind === 'catchAll') {
      params[seg.value] = parts
        .slice(i)
        .map((p) => safeDecode(p))
        .join('/')
      return params
    }
    const part = parts[i]
    if (part === undefined) return null
    if (seg.kind === 'static') {
      if (part !== seg.value) return null
    } else {
      params[seg.value] = safeDecode(part)
    }
  }

  // No catch-all consumed the tail: lengths must match exactly.
  return parts.length === segments.length ? params : null
}

/** Decode a URI segment, falling back to the raw value on malformed input. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Build a pathname from a `pattern` and `params`. Param values are URI-encoded.
 * Throws {@link RouterError} (`MISSING_PARAM`) if a required dynamic param is
 * absent. A missing/empty catch-all simply contributes nothing.
 *
 * @example
 * buildPath('/posts/:id', { id: '42' })       // '/posts/42'
 * buildPath('/files/:rest*', { rest: 'a/b' }) // '/files/a/b'
 * buildPath('/about', {})                     // '/about'
 */
export function buildPath(pattern: string, params: Record<string, string | number> = {}): string {
  const segments = parsePattern(pattern)
  const out: string[] = []

  for (const seg of segments) {
    if (seg.kind === 'static') {
      out.push(seg.value)
      continue
    }
    const value = params[seg.value]
    if (seg.kind === 'param') {
      if (value === undefined || value === '') {
        throw new RouterError(
          'MISSING_PARAM',
          `Missing value for required param ":${seg.value}" in pattern "${pattern}".`,
        )
      }
      out.push(encodeURIComponent(String(value)))
    } else {
      // catch-all: optional; encode each sub-segment so '/' stays a separator.
      if (value !== undefined && value !== '') {
        out.push(
          String(value)
            .split('/')
            .filter((s) => s.length > 0)
            .map((s) => encodeURIComponent(s))
            .join('/'),
        )
      }
    }
  }

  return `/${out.join('/')}`
}

/** Per-segment specificity weights: static > param > (end of pattern) > catch-all. */
const SEGMENT_WEIGHT = { static: 4, param: 3, catchAll: 1 } as const
/**
 * Weight for a "missing" segment slot (the pattern ended). It outranks a
 * catch-all (so the root `/` beats a bare `/:rest*`) but loses to a static or
 * dynamic segment (so a longer, more specific pattern still wins).
 */
const END_WEIGHT = 2

/**
 * Specificity score for a pattern: a per-segment weight tuple. Static segments
 * outrank dynamic, which outrank a pattern's end, which outranks a catch-all.
 * Used to sort routes so the most specific match wins.
 */
function score(pattern: string): number[] {
  return parsePattern(pattern).map((s) => SEGMENT_WEIGHT[s.kind])
}

/**
 * Compare two patterns by specificity. Returns a negative number if `a` is more
 * specific than `b` (so `routes.sort(compareSpecificity)` puts the most specific
 * first), positive if less specific, 0 if equal.
 */
export function compareSpecificity(a: string, b: string): number {
  const sa = score(a)
  const sb = score(b)
  const len = Math.max(sa.length, sb.length)
  for (let i = 0; i < len; i++) {
    const wa = sa[i] ?? END_WEIGHT
    const wb = sb[i] ?? END_WEIGHT
    if (wa !== wb) return wb - wa
  }
  return 0
}
