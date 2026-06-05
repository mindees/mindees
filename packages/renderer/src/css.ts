/**
 * Canonical CSS style serialization, shared by the DOM backend (applies per-prop to
 * `el.style`) and the headless/SSR backend (serializes to a CSS string). Sharing one
 * implementation guarantees **server-rendered markup matches the hydrated DOM** — the
 * thing that broke when SSR emitted camelCase names with no units.
 *
 * @module
 */

/**
 * CSS properties whose numeric value is unitless (no `px`). Mirrors React DOM's
 * `isUnitlessNumber` set — everything else gets `px` appended to a bare number, so a
 * platform-agnostic `{ width: 12 }` renders as `12px` on web (and stays `12` on native).
 */
export const UNITLESS_STYLE_PROPS = new Set([
  'opacity',
  'flex',
  'flexGrow',
  'flexShrink',
  'order',
  'zIndex',
  'fontWeight',
  'lineHeight',
  'aspectRatio',
])

/** Stringify a style value, appending `px` to a finite number on a non-unitless property. */
export function styleValue(prop: string, value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '' // NaN/Infinity → unset, never the literal "NaN"
    return UNITLESS_STYLE_PROPS.has(prop) ? String(value) : `${value}px`
  }
  return String(value)
}

/**
 * camelCase → kebab-case CSS property name. Custom properties (`--x`) pass through
 * verbatim; a leading-cap vendor prefix becomes a leading dash (`WebkitMask` →
 * `-webkit-mask`), and `ms*` gets the conventional `-ms-` prefix.
 */
export function cssPropName(prop: string): string {
  if (prop.startsWith('--')) return prop
  return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`).replace(/^ms-/, '-ms-')
}

/**
 * Serialize a style object to a CSS declaration string (`background-color:red;margin-top:8px`),
 * kebab-casing names and applying {@link styleValue} for units — matching what the DOM backend
 * writes to `el.style`. Nullish / non-finite values are dropped.
 */
export function serializeStyle(style: Record<string, unknown>): string {
  return Object.entries(style)
    .map(([prop, v]) => {
      if (v === null || v === undefined) return ''
      const val = styleValue(prop, v)
      return val === '' ? '' : `${cssPropName(prop)}:${val}`
    })
    .filter(Boolean)
    .join(';')
}
