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

/** Politeness for {@link announce} — `'polite'` waits for a pause; `'assertive'` interrupts. */
export type Announce = 'polite' | 'assertive'

// One persistent visually-hidden live region per politeness, reused across calls (created lazily).
const liveRegions: Partial<Record<Announce, { textContent: string }>> = {}
// Messages queued within the current frame per politeness — joined into ONE flush so two same-frame
// announce() calls both speak (a single region can hold one string; last-write-wins would drop the first).
const pendingMessages: Partial<Record<Announce, string[]>> = {}
const flushScheduled: Partial<Record<Announce, boolean>> = {}

interface DocLike {
  createElement(tag: string): {
    setAttribute(name: string, value: string): void
    style: { cssText: string }
    textContent: string
  }
  body: { appendChild(node: unknown): void } | null
}

/**
 * Imperatively announce `message` to screen readers (programmatic, not tied to a rendered node) — for
 * results that aren't otherwise voiced ("3 results found", "Saved", validation errors). Writes into a
 * persistent visually-hidden `aria-live` region (one per politeness), clearing first so the SAME message
 * re-announces. Multiple calls in the same frame are queued and joined (none is lost). SSR/native-safe.
 */
export function announce(message: string, politeness: Announce = 'polite'): void {
  const doc = (globalThis as unknown as { document?: DocLike }).document
  if (!doc || typeof doc.createElement !== 'function' || !doc.body) return
  let region = liveRegions[politeness]
  if (!region) {
    const el = doc.createElement('div')
    el.setAttribute('aria-live', politeness)
    el.setAttribute('aria-atomic', 'true')
    el.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status')
    // Visually hidden but still announced (the standard sr-only clip pattern).
    el.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0'
    doc.body.appendChild(el)
    region = el
    liveRegions[politeness] = el
  }
  let queue = pendingMessages[politeness]
  if (queue === undefined) {
    queue = []
    pendingMessages[politeness] = queue
  }
  queue.push(message)
  if (flushScheduled[politeness]) return // a flush is already queued this frame; messages will join
  flushScheduled[politeness] = true
  // Clear now so a repeated identical message still re-announces; set the joined batch on the next tick.
  region.textContent = ''
  const r = region
  const schedule =
    (globalThis as { requestAnimationFrame?: (cb: () => void) => void }).requestAnimationFrame ??
    ((cb: () => void) => setTimeout(cb, 16))
  schedule(() => {
    r.textContent = (pendingMessages[politeness] ?? []).join(' ')
    pendingMessages[politeness] = []
    flushScheduled[politeness] = false
  })
}
