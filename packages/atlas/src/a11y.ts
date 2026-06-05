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
  | 'separator'
  | 'progressbar'
  | 'none'
  | 'presentation'

/** Accessibility state, lowered to the matching `aria-*` attributes. */
export interface A11yState {
  disabled?: boolean
  selected?: boolean
  checked?: boolean
  pressed?: boolean
  expanded?: boolean
  busy?: boolean
  hidden?: boolean
}

/** The boolean state keys, paired with their `aria-*` attribute. */
const STATE_ARIA = [
  ['disabled', 'aria-disabled'],
  ['selected', 'aria-selected'],
  ['checked', 'aria-checked'],
  ['pressed', 'aria-pressed'],
  ['expanded', 'aria-expanded'],
  ['busy', 'aria-busy'],
  ['hidden', 'aria-hidden'],
] as const

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
  /**
   * Accessibility state → `aria-*`. Pass an **accessor** (`() => ({ checked: on() })`) to make the
   * `aria-*` attributes reactive — a static object bakes them once, so a screen reader never hears
   * a toggle change. Reactive keys are those present on the first read (stable shape).
   */
  state?: A11yState | (() => A11yState)
  /** Current value of a range widget (`aria-valuenow`); accessor → reactive. */
  valueNow?: number | (() => number)
  /** Minimum of a range widget (`aria-valuemin`). */
  valueMin?: number
  /** Maximum of a range widget (`aria-valuemax`). */
  valueMax?: number
}

/**
 * Lower {@link A11yProps} to a host prop bag of `role` + `aria-*` (only defined keys, so omitted
 * props stay omitted). Accessor-valued `state`/`valueNow` lower to **reactive** attribute bindings
 * (the renderer re-applies them via `setProp`), so accessibility tracks state changes.
 */
export function toA11yProps(a11y: A11yProps): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (a11y.role !== undefined) out.role = a11y.role
  if (a11y.label !== undefined) out['aria-label'] = a11y.label
  if (a11y.labelledBy !== undefined) out['aria-labelledby'] = a11y.labelledBy
  if (a11y.describedBy !== undefined) out['aria-describedby'] = a11y.describedBy
  if (a11y.live !== undefined) out['aria-live'] = a11y.live

  const s = a11y.state
  if (typeof s === 'function') {
    const initial = s()
    for (const [key, attr] of STATE_ARIA) {
      if (initial[key] === undefined) continue
      out[attr] = () => {
        const v = s()[key]
        return v === undefined ? undefined : String(v)
      }
    }
  } else if (s) {
    for (const [key, attr] of STATE_ARIA) {
      if (s[key] !== undefined) out[attr] = String(s[key])
    }
  }

  if (a11y.valueMin !== undefined) out['aria-valuemin'] = String(a11y.valueMin)
  if (a11y.valueMax !== undefined) out['aria-valuemax'] = String(a11y.valueMax)
  const vn = a11y.valueNow
  if (typeof vn === 'function') out['aria-valuenow'] = () => String(vn())
  else if (vn !== undefined) out['aria-valuenow'] = String(vn)

  return out
}
