/**
 * Atlas accessibility — a single typed `A11yProps` surface lowered to `role` + `aria-*`
 * attribute props. The DOM backend passes these through verbatim (`setAttribute`), so web a11y
 * is real; native hosts receive them as serialized props (interpretation is a 🔬 research-track
 * host concern — carried, never silently dropped). See `docs/adr/0022-atlas-primitives.md`.
 *
 * @module
 */

/** A WAI-ARIA-ish role, mapped straight to the host `role` attribute on web. */
export type Role =
  | 'button'
  | 'link'
  | 'image'
  | 'heading'
  | 'list'
  | 'listitem'
  | 'text'
  | 'textbox'
  | 'checkbox'
  | 'switch'
  | 'radio'
  | 'tab'
  | 'tabpanel'
  | 'dialog'
  | 'alert'
  | 'status'
  | 'none'
  | 'presentation'

/** Accessibility state, lowered to the matching `aria-*` attributes. */
export interface A11yState {
  disabled?: boolean
  selected?: boolean
  checked?: boolean
  expanded?: boolean
  busy?: boolean
  hidden?: boolean
}

/** The accessibility surface every Atlas primitive accepts. */
export interface A11yProps {
  /** ARIA role (web `role`). */
  role?: Role
  /** Accessible name (`aria-label`). */
  label?: string
  /** Id(s) of the element(s) labelling this one (`aria-labelledby`). */
  labelledBy?: string
  /** Id(s) of the element(s) describing this one (`aria-describedby`). */
  describedBy?: string
  /** Live-region politeness (`aria-live`). */
  live?: 'off' | 'polite' | 'assertive'
  /** Accessibility state (`aria-disabled`/`-selected`/`-checked`/`-expanded`/`-busy`/`aria-hidden`). */
  state?: A11yState
}

/**
 * Lower {@link A11yProps} to a host prop bag of `role` + `aria-*` (only keys that are defined,
 * so omitted props stay omitted — exactOptionalPropertyTypes-safe).
 */
export function toA11yProps(a11y: A11yProps): Record<string, string> {
  const out: Record<string, string> = {}
  if (a11y.role !== undefined) out.role = a11y.role
  if (a11y.label !== undefined) out['aria-label'] = a11y.label
  if (a11y.labelledBy !== undefined) out['aria-labelledby'] = a11y.labelledBy
  if (a11y.describedBy !== undefined) out['aria-describedby'] = a11y.describedBy
  if (a11y.live !== undefined) out['aria-live'] = a11y.live
  const s = a11y.state
  if (s) {
    if (s.disabled !== undefined) out['aria-disabled'] = String(s.disabled)
    if (s.selected !== undefined) out['aria-selected'] = String(s.selected)
    if (s.checked !== undefined) out['aria-checked'] = String(s.checked)
    if (s.expanded !== undefined) out['aria-expanded'] = String(s.expanded)
    if (s.busy !== undefined) out['aria-busy'] = String(s.busy)
    if (s.hidden !== undefined) out['aria-hidden'] = String(s.hidden)
  }
  return out
}
