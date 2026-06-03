/**
 * DOM host backend — renders to real `Node`s in a browser (or any DOM, such as
 * happy-dom/jsdom in tests).
 *
 * MindeesNative element tags map to DOM via a small alias table so the same app
 * tree (`view`, `text`, …) renders to sensible HTML; unknown tags pass through
 * as custom elements. Props become attributes, except `onX` event props (added
 * as listeners) and `style` objects (applied to `style`).
 *
 * @module
 */

import type { HostBackend } from './backend'

/** A minimal structural view of the DOM we use (so types don't require `lib.dom`). */
interface DomDocument {
  createElement(tag: string): DomElement
  createTextNode(data: string): DomText
}
interface DomNode {
  parentNode: DomNode | null
  nextSibling: DomNode | null
  nodeType: number
  removeChild(child: DomNode): DomNode
  insertBefore(node: DomNode, ref: DomNode | null): DomNode
}
interface DomElement extends DomNode {
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
  addEventListener(type: string, listener: (e: unknown) => void): void
  removeEventListener(type: string, listener: (e: unknown) => void): void
  style: Record<string, string> & { cssText: string }
}
interface DomText extends DomNode {
  data: string
}

const TEXT_NODE = 3

/** Tag aliases: MindeesNative semantic tags → HTML elements on the web target. */
const TAG_ALIASES: Record<string, string> = {
  view: 'div',
  text: 'span',
  image: 'img',
  scrollview: 'div',
  textinput: 'input',
  button: 'button',
}

/** Map a MindeesNative tag to its DOM tag. Unknown tags pass through. */
export function domTagFor(type: string): string {
  return TAG_ALIASES[type] ?? type
}

function isEventProp(key: string): boolean {
  return (
    key.length > 2 && key[0] === 'o' && key[1] === 'n' && key[2] === (key[2] ?? '').toUpperCase()
  )
}

/**
 * CSS properties whose numeric value is unitless (no `px`). Mirrors React DOM's
 * `isUnitlessNumber` set — everything else gets `px` appended to a bare number, so a
 * platform-agnostic `{ width: 12 }` renders as `12px` on web (and stays `12` on native).
 */
const UNITLESS_STYLE_PROPS = new Set([
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
function styleValue(prop: string, value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '' // NaN/Infinity → unset, never the literal "NaN"
    return UNITLESS_STYLE_PROPS.has(prop) ? String(value) : `${value}px`
  }
  return String(value)
}

/**
 * Form-control props that must be written as the live DOM **property** (not an attribute). The
 * `value`/`checked` *attribute* only seeds the DEFAULT; once the user edits, the property and
 * attribute diverge, so a controlled update must set the property to change what's shown.
 */
const FORM_PROPERTIES = new Set(['value', 'checked', 'selected', 'indeterminate'])

/** `onClick` → `click`, `onPointerDown` → `pointerdown`. */
function eventNameFor(key: string): string {
  return key.slice(2).toLowerCase()
}

/** Listeners we've attached, so reactive updates can swap them cleanly. */
const listeners = new WeakMap<object, Map<string, (e: unknown) => void>>()

/**
 * Create a {@link HostBackend} that renders to real DOM nodes.
 *
 * @param doc - The document to create nodes with. Defaults to the global
 *   `document`; pass a happy-dom/jsdom document for headless tests.
 */
export function createDomBackend(doc?: DomDocument): HostBackend<DomNode> {
  const documentRef = doc ?? (globalThis as unknown as { document?: DomDocument }).document
  if (!documentRef) {
    throw new Error(
      'createDomBackend: no document available (pass one explicitly outside a browser)',
    )
  }
  const document = documentRef

  return {
    createElement: (type) => document.createElement(domTagFor(type)),
    createText: (value) => document.createTextNode(value),

    setProp(node, key, value, prev): void {
      const el = node as DomElement
      if (isEventProp(key)) {
        const event = eventNameFor(key)
        let map = listeners.get(el)
        if (!map) {
          map = new Map()
          listeners.set(el, map)
        }
        const old = map.get(event)
        if (old) el.removeEventListener(event, old)
        if (typeof value === 'function') {
          const fn = value as (e: unknown) => void
          el.addEventListener(event, fn)
          map.set(event, fn)
        } else {
          map.delete(event)
        }
        return
      }
      if (key === 'style') {
        const style = el.style
        const next = value && typeof value === 'object' ? (value as Record<string, unknown>) : null
        const prevObj = prev && typeof prev === 'object' ? (prev as Record<string, unknown>) : null
        // Clear keys present in the previous style object but absent from the
        // new one, so stale inline styles don't persist across reactive updates.
        if (prevObj) {
          for (const prop of Object.keys(prevObj)) {
            if (!next || !(prop in next)) style[prop] = ''
          }
        }
        if (next) {
          for (const [prop, v] of Object.entries(next)) {
            // Nullish → unset (don't write the literal "undefined"/"null").
            style[prop] = v === null || v === undefined ? '' : styleValue(prop, v)
          }
        }
        return
      }
      if (FORM_PROPERTIES.has(key)) {
        // Live property, so a controlled `value`/`checked` updates what the user sees.
        ;(el as unknown as Record<string, unknown>)[key] =
          value === null || value === undefined ? '' : value
        return
      }
      if (value === false || value === null || value === undefined) {
        el.removeAttribute(key)
      } else {
        el.setAttribute(key, value === true ? '' : String(value))
      }
      void prev
    },

    setText(node, value): void {
      ;(node as DomText).data = value
    },

    insert(parent, node, anchor): void {
      ;(parent as DomNode).insertBefore(node, anchor)
    },

    remove(parent, node): void {
      ;(parent as DomNode).removeChild(node)
    },

    parentOf: (node) => node.parentNode,
    nextSibling: (node) => node.nextSibling,
    isText: (node) => node.nodeType === TEXT_NODE,
  }
}

export type { DomDocument, DomElement, DomNode, DomText }
