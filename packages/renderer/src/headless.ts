/**
 * Headless host backend — an in-memory host tree, no browser required.
 *
 * This is the **reference backend**: it implements the full {@link HostBackend}
 * (plus {@link SerializableBackend}) so the entire reconciler can be exercised
 * in CI without a DOM. It's also handy for snapshot-testing rendered output.
 *
 * @module
 */

import type { SerializableBackend, SerializeOptions } from './backend'
import { serializeStyle } from './css'

/** A headless host node: an element (with tag/props/children) or a text node. */
export interface HeadlessNode {
  /** `"#text"` for text nodes, otherwise the element tag. */
  type: string
  /** Applied props (elements only). */
  props: Record<string, unknown>
  /** Text content (text nodes only). */
  text: string
  /** Child nodes (elements only). */
  children: HeadlessNode[]
  /** Back-pointer to the parent, or `null` when detached. */
  parent: HeadlessNode | null
}

const TEXT = '#text'

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Render an attribute value. ONLY the `style` attribute runs the CSS serializer (kebab-case + `px`),
 * matching the DOM backend so SSR markup equals the hydrated DOM. Gating on the NAME (not the value
 * type) is essential: a non-`style` object prop (e.g. `data-config={{…}}`) must serialize the same way
 * the DOM backend does (`String(value)`), not get CSS-mangled — otherwise SSR/DOM hydration diverges.
 */
function serializeAttrValue(key: string, value: unknown): string {
  if (key === 'style' && value && typeof value === 'object') {
    return serializeStyle(value as Record<string, unknown>)
  }
  return String(value)
}

/**
 * Whether `key` is a safe HTML attribute name. Attribute NAMES are interpolated
 * into markup unescaped, so a name containing `>`, whitespace, quotes, `=`, `/`,
 * etc. could break out of the tag and inject markup (stored XSS when props are
 * built from user/server data). We emit only names that match the HTML name
 * grammar — matching what the DOM's `setAttribute` would accept — and drop the
 * rest, exactly as an invalid name would never reach the DOM either.
 */
function isValidAttrName(key: string): boolean {
  return /^[A-Za-z_:][\w:.-]*$/.test(key)
}

/**
 * Serialize a headless node (and subtree) to HTML. A standalone function, not an
 * object method: the public {@link SerializableBackend.serialize} is typed as a
 * plain function member, so a consumer may legally detach it
 * (`const { serialize } = backend`). Recursing through this lexical helper rather
 * than `this.serialize` keeps it binding-independent.
 */
function serializeHeadless(node: HeadlessNode, options?: SerializeOptions): string {
  if (node.type === TEXT) return escapeText(node.text)
  const mapTag = options?.mapTag ?? ((t: string) => t)
  const tag = mapTag(node.type)
  // The tag is interpolated into `<tag>`/`</tag>` unescaped, so a tag containing `>`,
  // whitespace, etc. would break out of the element and inject markup. Reject any tag
  // that isn't a valid name (same grammar as attribute names) — fail closed.
  if (!isValidAttrName(tag)) {
    throw new Error(`refusing to serialize unsafe element tag: ${JSON.stringify(tag)}`)
  }
  const attrs = Object.entries(node.props)
    .filter(([key]) => !isEventProp(key) && isValidAttrName(key))
    .map(([key, value]) =>
      // Boolean `true` → a valueless attribute (`disabled=""`), matching the DOM
      // backend (dom.ts) so SSR markup equals hydrated markup.
      value === true ? ` ${key}=""` : ` ${key}="${escapeAttr(serializeAttrValue(key, value))}"`,
    )
    .join('')
  // HTML void elements (e.g. `img`, `input` — what `image`/`textinput` map to) have NO closing tag
  // and NO children: emitting `<img>...</img>` is malformed and the browser reparents the children as
  // siblings, diverging from the reconciler's tree. Emit a self-contained start tag only.
  if (VOID_ELEMENTS.has(tag)) {
    return `<${tag}${attrs}>`
  }
  const inner = node.children.map((c) => serializeHeadless(c, options)).join('')
  return `<${tag}${attrs}>${inner}</${tag}>`
}

/** HTML void elements — serialized with no closing tag and no children (post-`mapTag` names). */
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

/** Options for {@link createHeadlessBackend}. */
export interface HeadlessBackendOptions {
  /**
   * A designated overlay node for portals. Omit (the default) and `overlayRoot` is unimplemented,
   * so portals mount IN PLACE — the SSR-correct behavior (`renderToString` only serializes the
   * root's own children). Pass a node to test relocated portal placement.
   */
  readonly overlayRoot?: HeadlessNode
}

/** Create a {@link SerializableBackend} backed by an in-memory tree. */
export function createHeadlessBackend(
  options: HeadlessBackendOptions = {},
): SerializableBackend<HeadlessNode> {
  const backend: SerializableBackend<HeadlessNode> = {
    createElement(type: string): HeadlessNode {
      return { type, props: {}, text: '', children: [], parent: null }
    },

    createText(value: string): HeadlessNode {
      return { type: TEXT, props: {}, text: value, children: [], parent: null }
    },

    setProp(node, key, value): void {
      // Event handlers and falsy values are tracked but not serialized as attrs.
      if (value === undefined || value === null || value === false) {
        delete node.props[key]
      } else {
        node.props[key] = value
      }
    },

    setText(node, value): void {
      node.text = value
    },

    insert(parent, node, anchor): void {
      if (node.parent) {
        const prevSiblings = node.parent.children
        const at = prevSiblings.indexOf(node)
        if (at >= 0) prevSiblings.splice(at, 1)
      }
      node.parent = parent
      if (anchor === null) {
        parent.children.push(node)
      } else {
        const idx = parent.children.indexOf(anchor)
        parent.children.splice(idx < 0 ? parent.children.length : idx, 0, node)
      }
    },

    remove(parent, node): void {
      const idx = parent.children.indexOf(node)
      if (idx >= 0) parent.children.splice(idx, 1)
      node.parent = null
    },

    parentOf(node): HeadlessNode | null {
      return node.parent
    },

    nextSibling(node): HeadlessNode | null {
      const parent = node.parent
      if (!parent) return null
      const idx = parent.children.indexOf(node)
      return idx >= 0 && idx + 1 < parent.children.length
        ? (parent.children[idx + 1] ?? null)
        : null
    },

    isText(node): boolean {
      return node.type === TEXT
    },

    serialize: serializeHeadless,
  }
  // Only expose overlayRoot when a target was provided, so the default stays in-place (SSR-correct).
  if (options.overlayRoot) {
    const target = options.overlayRoot
    backend.overlayRoot = () => target
  }
  return backend
}

/** Whether a prop key is an event handler (`onClick`, `onPress`, …). */
export function isEventProp(key: string): boolean {
  return (
    key.length > 2 && key[0] === 'o' && key[1] === 'n' && key[2] === (key[2] ?? '').toUpperCase()
  )
}

/** Convenience: create a detached headless root element (default tag `"root"`). */
export function createHeadlessRoot(type = 'root'): HeadlessNode {
  return { type, props: {}, text: '', children: [], parent: null }
}
