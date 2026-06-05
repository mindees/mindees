/**
 * Atlas `List` — a virtualized, **recycling** list. Only the visible window (+ overscan) is
 * rendered; rows are a FIXED POOL of per-slot reactive regions, NOT one region returning
 * `items.map(...)` (the Helix reconciler has no keyed array diff, so a single array region
 * would tear down + remount every visible row on each scroll). Each slot region depends only
 * on its own `active` signal, so a row that stays in view keeps its identity and `renderItem`
 * runs once for it — only rows scrolling across the window edge are (re)created. A total-height
 * spacer keeps the native scrollbar correct; rows are absolutely positioned by `transform`.
 *
 * Fixed row height in v1 (deterministic windowing, headless-testable with zero real scroll);
 * variable/measured heights are a 🔬 research track. See `docs/adr/0023-atlas-list.md`.
 *
 * @module
 */

import {
  batch,
  createElement,
  effect,
  type MindeesNode,
  memo,
  type Signal,
  signal,
} from '@mindees/core'
import type { Reactive } from './host'
import { ScrollView } from './primitives'
import { flattenStyle, type StyleInput } from './style'

/** The computed visible window over the item list. */
export interface ListWindow {
  /** First visible index (inclusive), overscan applied. */
  readonly startIndex: number
  /** Last visible index (exclusive), overscan applied. */
  readonly endIndex: number
  /** Total scrollable height (px) = itemCount × itemHeight. */
  readonly totalHeight: number
}

/**
 * Pure window math: which item indices are visible for a given scroll offset. Exported and
 * exhaustively unit-tested — the deterministic heart of virtualization (no signals, no DOM).
 */
export function computeWindow(
  scrollTop: number,
  viewportHeight: number,
  itemHeight: number,
  itemCount: number,
  overscan: number,
): ListWindow {
  const totalHeight = itemCount * itemHeight
  if (itemCount <= 0) return { startIndex: 0, endIndex: 0, totalHeight: 0 }
  const top = Math.max(0, Math.min(scrollTop, Math.max(0, totalHeight - viewportHeight)))
  const firstVisible = Math.floor(top / itemHeight)
  const lastVisible = Math.ceil((top + viewportHeight) / itemHeight)
  const startIndex = Math.max(0, firstVisible - overscan)
  const endIndex = Math.min(itemCount, lastVisible + overscan)
  return { startIndex, endIndex, totalHeight }
}

/** Options for {@link createList}. */
export interface ListOptions<T> {
  /** The items, static or reactive. */
  readonly items: readonly T[] | (() => readonly T[])
  /**
   * Render one row. Receives reactive `item`/`index` **accessors** — consume them LAZILY
   * (`Text({ children: () => item().name })`, a `style` fn, or pass them to a child) so a
   * recycled slot patches in place. Reading `item()`/`index()` synchronously in the body bakes
   * the value in and opts the row out of recycling (it re-runs renderItem on reuse instead).
   */
  readonly renderItem: (item: () => T, index: () => number) => MindeesNode
  /** Fixed row height in px (variable heights are a research track). */
  readonly itemHeight: number
  /** Viewport height in px. */
  readonly height: number
  /** Extra rows rendered above/below the viewport (default 3, clamped 0–50). */
  readonly overscan?: number
  /** Read the current scroll offset (test/SSR injection seam; default 0). */
  readonly getScrollOffset?: () => number
  /**
   * Fires once when the last item is within the rendered window — including at mount if the list
   * already fits the viewport — and re-arms when the end scrolls back out (e.g. to load more).
   */
  readonly onEndReached?: () => void
  /** Extra style on the scroll container. */
  readonly style?: Reactive<StyleInput>
}

interface Slot<T> {
  readonly item: Signal<T | undefined>
  readonly index: Signal<number>
  readonly top: Signal<number>
  readonly active: Signal<boolean>
}

function readScrollTop(event: unknown): number {
  const top = (event as { target?: { scrollTop?: number } })?.target?.scrollTop
  return typeof top === 'number' && Number.isFinite(top) ? top : 0
}

/**
 * Create a virtualized recycling list as a renderer-agnostic `MindeesNode`.
 *
 * @throws RangeError if `itemHeight`/`height` are not positive finite numbers.
 */
export function createList<T>(options: ListOptions<T>): MindeesNode {
  const { renderItem, itemHeight, height } = options
  if (!Number.isFinite(itemHeight) || itemHeight <= 0) {
    throw new RangeError('List itemHeight must be a positive number')
  }
  if (!Number.isFinite(height) || height <= 0) {
    throw new RangeError('List height must be a positive number')
  }
  const overscan = Math.max(0, Math.min(50, Math.floor(options.overscan ?? 3)))
  const itemsOf: () => readonly T[] =
    typeof options.items === 'function' ? options.items : () => options.items as readonly T[]

  // Return a reactive-region accessor so ALL the signals/memo/effect below are created under the
  // mounting owner (the renderer runs this once via bindReactiveChild) and are disposed on
  // unmount. Creating them eagerly here would leave them un-owned (currentOwner === null at call
  // time) and leak past `dispose()`. Validation above stays synchronous (throws at call time).
  return () => {
    const scrollTop = signal(options.getScrollOffset ? options.getScrollOffset() : 0)
    const poolSize = Math.ceil(height / itemHeight) + 2 * overscan + 1

    // Re-run the assignment only when the integer window actually changes (not every pixel).
    const windowMemo = memo(
      () => computeWindow(scrollTop(), height, itemHeight, itemsOf().length, overscan),
      {
        equals: (a, b) => a.startIndex === b.startIndex && a.endIndex === b.endIndex,
      },
    )

    const slots: Slot<T>[] = Array.from({ length: poolSize }, () => ({
      item: signal<T | undefined>(undefined),
      index: signal(0),
      top: signal(0),
      active: signal(false),
    }))

    let endReachedFired = false
    // Assign each visible index to slot `index % poolSize`; deactivate the rest. Max window size
    // equals poolSize (the `+1` is that exact margin — do NOT remove it), and any run of ≤
    // poolSize consecutive indices has distinct residues mod poolSize, so no two visible indices
    // ever share a slot.
    effect(() => {
      const { startIndex, endIndex } = windowMemo()
      const items = itemsOf()
      const used = new Array<boolean>(poolSize).fill(false)
      batch(() => {
        for (let i = startIndex; i < endIndex; i++) {
          const s = ((i % poolSize) + poolSize) % poolSize
          used[s] = true
          const slot = slots[s]
          if (!slot) continue
          slot.item.set(items[i])
          slot.index.set(i)
          slot.top.set(i * itemHeight)
          slot.active.set(true)
        }
        for (let s = 0; s < poolSize; s++) {
          if (!used[s]) slots[s]?.active.set(false)
        }
      })
      // onEndReached: fire when the last item is within the window (incl. at mount if the list
      // fits the viewport); re-arm when the end leaves the window.
      if (options.onEndReached && items.length > 0) {
        if (endIndex >= items.length) {
          if (!endReachedFired) {
            endReachedFired = true
            options.onEndReached()
          }
        } else {
          endReachedFired = false
        }
      }
    })

    // One reactive region per slot. The body depends ONLY on `active()`, so a slot that stays
    // active never re-runs renderItem; item/index/top flow through the inner accessors — provided
    // renderItem consumes them lazily (see the ListOptions.renderItem contract).
    const rows: MindeesNode[] = slots.map((slot, s) => () => {
      if (!slot.active()) return null
      const content = renderItem(
        () => slot.item() as T,
        () => slot.index(),
      )
      return createElement(
        'view',
        {
          key: `atlas-list-row-${s}`,
          style: () => ({
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: itemHeight,
            transform: `translateY(${slot.top()}px)`,
          }),
        },
        content,
      )
    })

    const spacer = createElement(
      'view',
      {
        style: () => ({
          position: 'relative',
          width: '100%',
          height: itemsOf().length * itemHeight,
        }),
      },
      ...rows,
    )

    // A reactive (accessor) `style` must stay reactive — eagerly flattening it would
    // Object.assign a function and silently drop it. Keep it a function when the caller's is.
    const baseScrollStyle: StyleInput = { height, position: 'relative' }
    const callerStyle = options.style
    const scrollStyle: Reactive<StyleInput> =
      typeof callerStyle === 'function'
        ? () => flattenStyle([baseScrollStyle, (callerStyle as () => StyleInput)()])
        : flattenStyle([baseScrollStyle, callerStyle as StyleInput])

    return createElement(
      ScrollView,
      {
        onScroll: (event: unknown) => scrollTop.set(readScrollTop(event)),
        style: scrollStyle,
      },
      spacer,
    )
  }
}

/** Component-style alias for {@link createList}. */
export function List<T>(options: ListOptions<T>): MindeesNode {
  return createList(options)
}

// ---------------------------------------------------------------------------
// SectionList
// ---------------------------------------------------------------------------

/** A list section: an optional header + its rows. */
export interface Section<T> {
  /** Header title (used by the default header when `renderSectionHeader` is omitted). */
  readonly title?: string
  readonly data: readonly T[]
  /** Stable key for the section (optional). */
  readonly key?: string
}

/** A flattened section-list entry: a header or a row. */
type Entry<T> =
  | { readonly kind: 'header'; readonly section: Section<T>; readonly sectionIndex: number }
  | {
      readonly kind: 'item'
      readonly section: Section<T>
      readonly item: T
      readonly sectionIndex: number
      readonly itemIndex: number
    }

/** Flatten sections into a single ordered entry list (header, its rows, next header, …). */
export function flattenSections<T>(sections: readonly Section<T>[]): Entry<T>[] {
  const out: Entry<T>[] = []
  sections.forEach((section, sectionIndex) => {
    out.push({ kind: 'header', section, sectionIndex })
    section.data.forEach((item, itemIndex) => {
      out.push({ kind: 'item', section, item, sectionIndex, itemIndex })
    })
  })
  return out
}

/** Options for {@link createSectionList}. */
export interface SectionListOptions<T> {
  /** The sections, static or reactive. */
  readonly sections: readonly Section<T>[] | (() => readonly Section<T>[])
  /** Render one row (same lazy-accessor contract as {@link ListOptions.renderItem}). */
  readonly renderItem: (item: () => T, index: () => number) => MindeesNode
  /** Render a section header (defaults to a `text` of `section.title`). */
  readonly renderSectionHeader?: (section: () => Section<T>) => MindeesNode
  /** Fixed row height in px (headers and rows share it in v1). */
  readonly itemHeight: number
  readonly height: number
  readonly overscan?: number
  readonly onEndReached?: () => void
  readonly style?: Reactive<StyleInput>
}

/**
 * A virtualized **section list** built on {@link createList}: sections are flattened to a
 * single entry stream (header, rows, …) and windowed, so only visible headers/rows render.
 * Fixed row height in v1 (headers share it) — variable heights track the List's research item.
 */
export function createSectionList<T>(options: SectionListOptions<T>): MindeesNode {
  const sectionsOf: () => readonly Section<T>[] =
    typeof options.sections === 'function'
      ? options.sections
      : () => options.sections as readonly Section<T>[]

  return createList<Entry<T>>({
    items: () => flattenSections(sectionsOf()),
    itemHeight: options.itemHeight,
    height: options.height,
    ...(options.overscan !== undefined ? { overscan: options.overscan } : {}),
    ...(options.onEndReached ? { onEndReached: options.onEndReached } : {}),
    ...(options.style !== undefined ? { style: options.style } : {}),
    // The branch reads `entry()`, so a recycled slot re-runs this when its entry changes —
    // correct for mixed header/row content (rows still virtualize: only the visible window renders).
    renderItem: (entry) => () => {
      const e = entry()
      if (e.kind === 'header') {
        return options.renderSectionHeader
          ? options.renderSectionHeader(() => entry().section)
          : createElement('text', null, e.section.title ?? '')
      }
      return options.renderItem(
        () => (entry() as Extract<Entry<T>, { kind: 'item' }>).item,
        () => (entry() as Extract<Entry<T>, { kind: 'item' }>).itemIndex,
      )
    },
  })
}

/** Component-style alias for {@link createSectionList}. */
export function SectionList<T>(options: SectionListOptions<T>): MindeesNode {
  return createSectionList(options)
}
