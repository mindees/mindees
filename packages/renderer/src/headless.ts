/**
 * Headless host backend — an in-memory host tree, no browser required.
 *
 * This is the **reference backend**: it implements the full {@link HostBackend}
 * (plus {@link SerializableBackend}) so the entire reconciler can be exercised
 * in CI without a DOM. It's also handy for snapshot-testing rendered output.
 *
 * @module
 */

import type { SerializableBackend } from './backend'

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

/** Render an attribute value: a `style` object becomes a CSS string. */
function serializeAttrValue(value: unknown): string {
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([prop, v]) => `${prop}:${String(v)}`)
      .join(';')
  }
  return String(value)
}

/** Create a {@link SerializableBackend} backed by an in-memory tree. */
export function createHeadlessBackend(): SerializableBackend<HeadlessNode> {
  return {
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

    serialize(node, options): string {
      if (node.type === TEXT) return escapeText(node.text)
      const mapTag = options?.mapTag ?? ((t: string) => t)
      const tag = mapTag(node.type)
      const attrs = Object.entries(node.props)
        .filter(([key]) => !isEventProp(key))
        .map(([key, value]) => ` ${key}="${escapeAttr(serializeAttrValue(value))}"`)
        .join('')
      const inner = node.children.map((c) => this.serialize(c, options)).join('')
      return `<${tag}${attrs}>${inner}</${tag}>`
    },
  }
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
