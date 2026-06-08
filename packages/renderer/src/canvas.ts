/**
 * The **Helix Canvas strand** (spec §6.2) — a retained-mode 2D scene graph driven by the SAME
 * reconciler as the native/DOM strands, painting to a 2D context. You get Flutter-grade pixel control
 * *exactly where you want it*: a `<canvas-rect>`/`<canvas-text>`/… subtree is built + diffed by Helix,
 * and `paint(ctx)` rasterizes it. The 2D context is an interface ({@link Scene2DContext}) — a real
 * `CanvasRenderingContext2D` satisfies it on web today, and a WebGPU rasterizer can drive the same
 * scene graph later without touching app code.
 *
 * @module
 */

import type { HostBackend } from './backend'

/** The subset of `CanvasRenderingContext2D` the painter uses (so a WebGPU/mock backend can satisfy it). */
export interface Scene2DContext {
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  globalAlpha: number
  font: string
  textBaseline: string
  save(): void
  restore(): void
  clearRect(x: number, y: number, w: number, h: number): void
  fillRect(x: number, y: number, w: number, h: number): void
  strokeRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arc(x: number, y: number, r: number, start: number, end: number): void
  closePath(): void
  fill(): void
  stroke(): void
  fillText(text: string, x: number, y: number): void
}

/** A node in the canvas scene graph. */
export interface SceneNode {
  type: string
  readonly props: Record<string, unknown>
  text: string
  readonly isTextNode: boolean
  parent: SceneNode | null
  readonly children: SceneNode[]
}

/** A Canvas2D backend: the reconciler builds the scene; `paint(ctx)` rasterizes it. */
export interface Canvas2DBackend extends HostBackend<SceneNode> {
  /** The scene root (pass to `render(tree, backend, root)`). */
  readonly root: SceneNode
  /** Rasterize the whole scene to `ctx` (clears `[0,0,width,height]` first). */
  paint(ctx: Scene2DContext, width: number, height: number): void
}

const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

function makeNode(type: string, isTextNode: boolean, text = ''): SceneNode {
  return { type, props: {}, text, isTextNode, parent: null, children: [] }
}

/** Concatenate the immediate text-node children of `node` (how a `canvas-text`'s string content arrives). */
function textOf(node: SceneNode): string {
  let out = ''
  for (const c of node.children) if (c.isTextNode) out += c.text
  return out
}

/** Draw one scene node (and recurse). Coordinates are absolute (no transform stack in v1). */
function drawNode(ctx: Scene2DContext, node: SceneNode): void {
  if (node.isTextNode) return
  const p = node.props
  const opacity = p.opacity === undefined ? 1 : num(p.opacity, 1)
  const needsAlpha = opacity !== 1
  if (needsAlpha) {
    ctx.save()
    ctx.globalAlpha *= opacity
  }
  const fill = str(p.fill)
  const stroke = str(p.stroke)
  const strokeWidth = num(p.strokeWidth, 1)

  switch (node.type) {
    case 'canvas-rect': {
      const x = num(p.x)
      const y = num(p.y)
      const w = num(p.width)
      const h = num(p.height)
      if (fill) {
        ctx.fillStyle = fill
        ctx.fillRect(x, y, w, h)
      }
      if (stroke) {
        ctx.strokeStyle = stroke
        ctx.lineWidth = strokeWidth
        ctx.strokeRect(x, y, w, h)
      }
      break
    }
    case 'canvas-circle': {
      const cx = num(p.x)
      const cy = num(p.y)
      const r = num(p.radius)
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.closePath()
      if (fill) {
        ctx.fillStyle = fill
        ctx.fill()
      }
      if (stroke) {
        ctx.strokeStyle = stroke
        ctx.lineWidth = strokeWidth
        ctx.stroke()
      }
      break
    }
    case 'canvas-line': {
      ctx.beginPath()
      ctx.moveTo(num(p.x1), num(p.y1))
      ctx.lineTo(num(p.x2), num(p.y2))
      ctx.strokeStyle = stroke ?? fill ?? '#000'
      ctx.lineWidth = strokeWidth
      ctx.stroke()
      break
    }
    case 'canvas-text': {
      const content = textOf(node)
      if (content) {
        ctx.font = str(p.font) ?? '16px sans-serif'
        ctx.textBaseline = str(p.baseline) ?? 'top'
        ctx.fillStyle = fill ?? '#000'
        ctx.fillText(content, num(p.x), num(p.y))
      }
      break
    }
    // 'canvas' (root) and 'canvas-group' just composite their children.
    default:
      break
  }
  for (const child of node.children) drawNode(ctx, child)
  if (needsAlpha) ctx.restore()
}

/**
 * Create a Canvas2D scene backend. Drive it with the reconciler
 * (`render(scene, backend, backend.root)`), then call `backend.paint(ctx, w, h)` to rasterize — on a
 * frame loop for animations, or once for static art. `onDirty` fires after any mutation so a host can
 * schedule a repaint.
 */
/** Options for {@link createCanvas2DBackend}. */
export interface Canvas2DBackendOptions {
  /** Called after any scene mutation so a host can schedule a repaint of the 2D context. */
  readonly onDirty?: () => void
}

export function createCanvas2DBackend(options: Canvas2DBackendOptions = {}): Canvas2DBackend {
  const root = makeNode('canvas', false)
  const markDirty = (): void => options.onDirty?.()

  return {
    root,
    createElement: (type) => makeNode(type, false),
    createText: (value) => makeNode('#text', true, value),
    setText(node, value) {
      node.text = value
      markDirty()
    },
    setProp(node, key, value) {
      if (value === undefined) delete node.props[key]
      else node.props[key] = value
      markDirty()
    },
    insert(parent, node, anchor) {
      // Move-semantics (matches the headless/native/DOM backends): if the node is already mounted,
      // detach it from its old parent FIRST so a keyed-list reorder MOVES it rather than duplicating
      // it in the scene graph. The anchor index is read AFTER the detach (it can shift on removal).
      if (node.parent) {
        const prev = node.parent.children
        const at = prev.indexOf(node)
        if (at >= 0) prev.splice(at, 1)
      }
      node.parent = parent
      const idx = anchor ? parent.children.indexOf(anchor) : -1
      if (idx >= 0) parent.children.splice(idx, 0, node)
      else parent.children.push(node)
      markDirty()
    },
    remove(parent, node) {
      const idx = parent.children.indexOf(node)
      if (idx >= 0) parent.children.splice(idx, 1)
      node.parent = null
      markDirty()
    },
    parentOf: (node) => node.parent,
    nextSibling(node) {
      const siblings = node.parent?.children
      if (!siblings) return null
      const idx = siblings.indexOf(node)
      return idx >= 0 && idx + 1 < siblings.length ? (siblings[idx + 1] as SceneNode) : null
    },
    isText: (node) => node.isTextNode,
    paint(ctx, width, height) {
      ctx.clearRect(0, 0, width, height)
      for (const child of root.children) drawNode(ctx, child)
    },
  }
}
