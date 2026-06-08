/**
 * Atlas overlays — `Modal` + `FocusScope`, built on core's `portal`.
 *
 * `Modal` gates a portal by a reactive `visible`: on open it relocates a scrim + a focus-scoped
 * dialog to the renderer's overlay layer (above the tree); on close the gating region re-runs,
 * firing the portal's cleanup (unmount) and the FocusScope's focus-restore. `FocusScope` captures
 * the previously-focused element, auto-focuses its container, and restores focus on unmount —
 * DOM-feature-detected, so it no-ops on native/headless (the dialog markup + a11y still serialize).
 *
 * v1 scope: web is fully interactive (scrim dismiss, Escape, focus capture/restore). Native is
 * declarative — `role="dialog"` + `aria-modal` are carried to the host; a true focus trap +
 * tab-cycling and back-button handling are a host follow-up (see the portal-modal ADR). Tab
 * cycling within the scope is also deferred (needs a descendant query).
 *
 * @module
 */

import {
  type Component,
  createElement,
  effect,
  type MindeesNode,
  onCleanup,
  portal,
} from '@mindees/core'
import type { A11yProps, Role } from './a11y'
import type { Reactive } from './host'
import { Pressable, Text, View } from './primitives'
import { flattenStyle, type StyleInput } from './style'

function toAccessor<T>(value: Reactive<T>, fallback: T): () => T {
  return typeof value === 'function'
    ? (value as () => T)
    : () => (value === undefined ? fallback : value)
}

/** Props for {@link FocusScope}. */
export interface FocusScopeProps {
  readonly children?: MindeesNode
  /** Focus the scope container on mount (default true). */
  readonly autoFocus?: boolean
  /** Restore focus to the previously-focused element on unmount (default true). */
  readonly restoreFocus?: boolean
  /** Called when Escape is pressed inside the scope. */
  readonly onEscape?: () => void
  /** Dialog role (default `'dialog'`). */
  readonly role?: Role
  /** Accessible name (`aria-label`). */
  readonly label?: string
  /** Extra style on the scope container. */
  readonly style?: Reactive<StyleInput>
}

/** Tabbable descendants of a focus scope (the standard focusable set, minus `tabindex="-1"`). */
const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

interface FocusableNode {
  focus?: () => void
  querySelectorAll?: (selector: string) => ArrayLike<{ focus?: () => void }>
  isConnected?: boolean
}

/** A focus-scoped, `aria-modal` container. Captures + restores focus AND traps Tab on web; declarative elsewhere. */
export const FocusScope: Component<FocusScopeProps> = (props) => {
  let restore: (() => void) | null = null
  let scopeNode: FocusableNode | null = null
  const captureAndFocus = (host: unknown): void => {
    if (typeof document === 'undefined') return // native/headless: declarative only
    const node = host as FocusableNode | null
    scopeNode = node
    const doc = document as unknown as { activeElement?: { focus?: () => void } | null }
    const previous = doc.activeElement ?? null
    if (props.restoreFocus !== false && previous && typeof previous.focus === 'function') {
      restore = () => previous.focus?.()
    }
    if (props.autoFocus !== false && node && typeof node.focus === 'function') {
      // Defer: `ref` fires before the portal subtree is connected to the document, so a synchronous
      // focus() would no-op. By the microtask the subtree is mounted; skip if it closed first.
      queueMicrotask(() => {
        if (node.isConnected) node.focus?.()
      })
    }
  }
  // Trap Tab within the scope (WCAG 2.4.3): wrap focus from the last tabbable to the first (and back on
  // Shift+Tab), so keyboard focus can't escape an open modal. No-op if the scope has no tabbable children.
  const trapTab = (e: { shiftKey?: boolean; preventDefault?: () => void }): void => {
    const node = scopeNode
    if (typeof document === 'undefined' || !node?.querySelectorAll) return
    const all = Array.from(node.querySelectorAll(FOCUSABLE_SELECTOR))
    if (all.length === 0) {
      e.preventDefault?.()
      node.focus?.() // nothing tabbable inside → keep focus on the dialog itself
      return
    }
    const first = all[0]
    const last = all[all.length - 1]
    const active = (document as unknown as { activeElement?: unknown }).activeElement
    if (e.shiftKey && active === first) {
      e.preventDefault?.()
      last?.focus?.()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault?.()
      first?.focus?.()
    }
  }
  onCleanup(() => restore?.())

  const callerStyle = props.style
  const style: Reactive<StyleInput> = () =>
    flattenStyle([
      { position: 'relative' },
      typeof callerStyle === 'function' ? callerStyle() : (callerStyle ?? {}),
    ])

  const hostProps: Record<string, unknown> = {
    role: props.role ?? 'dialog',
    'aria-modal': 'true',
    tabindex: -1,
    ref: captureAndFocus,
    style,
  }
  if (props.label !== undefined) hostProps['aria-label'] = props.label
  hostProps.onKeyDown = (e: unknown) => {
    const ev = e as { key?: string; shiftKey?: boolean; preventDefault?: () => void }
    if (ev.key === 'Escape') props.onEscape?.()
    else if (ev.key === 'Tab') trapTab(ev)
  }
  // A RAW host `view` (not the curated View primitive) so ref/tabindex/onKeyDown/aria-modal pass through.
  return createElement('view', hostProps, props.children)
}

/** Props for {@link Modal}. */
export interface ModalProps extends A11yProps {
  /** Whether the modal is open (static or reactive). */
  readonly visible: Reactive<boolean>
  /** Requested close (scrim press or Escape). */
  readonly onRequestClose?: () => void
  readonly children?: MindeesNode
  /** Close when the scrim is pressed (default true). */
  readonly closeOnBackdrop?: boolean
  /** Extra style merged into the scrim. */
  readonly backdrop?: Reactive<StyleInput>
  /** Explicit overlay host target (else the backend's overlay layer). */
  readonly mount?: unknown
}

/** A portal-backed modal dialog: a dismissable scrim + a focus-scoped dialog above the tree. */
export const Modal: Component<ModalProps> = (props) => {
  const isVisible = toAccessor(props.visible, false)
  return () => {
    if (!isVisible()) return null

    const scrimStyle = (): StyleInput =>
      flattenStyle([
        {
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
        },
        typeof props.backdrop === 'function' ? props.backdrop() : (props.backdrop ?? {}),
      ])
    const scrim = createElement(Pressable, {
      style: scrimStyle,
      label: 'Close',
      ...(props.closeOnBackdrop !== false && props.onRequestClose
        ? { onPress: props.onRequestClose }
        : {}),
    })

    const dialog = createElement(
      FocusScope,
      {
        role: props.role ?? 'dialog',
        ...(props.onRequestClose ? { onEscape: props.onRequestClose } : {}),
        ...(props.label !== undefined ? { label: props.label } : {}),
      },
      props.children,
    )

    // A full-screen flex-center container holds the scrim (behind) + the dialog (on top, centered).
    const container = createElement(
      View,
      {
        style: () => ({
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }),
      },
      scrim,
      dialog,
    )
    return portal(container, props.mount !== undefined ? { mount: props.mount } : undefined)
  }
}

/** Props for {@link Toast}. */
export interface ToastProps {
  /** Whether the toast is shown (static or reactive). */
  readonly visible: Reactive<boolean>
  /** Convenience message (string or node); or pass `children`. */
  readonly message?: MindeesNode
  readonly children?: MindeesNode
  /** Auto-dismiss after this many ms (calls `onDismiss`). `0`/omitted → stays until hidden. */
  readonly duration?: number
  readonly onDismiss?: () => void
  /** Anchor edge (default `bottom`). */
  readonly position?: 'top' | 'bottom'
  /** a11y role (default `status`; use `alert` for errors). */
  readonly role?: Role
  /** Explicit overlay host target (else the backend's overlay layer). */
  readonly mount?: unknown
}

/**
 * A portal-backed transient notification (Snackbar). Controlled by `visible`; optionally auto-dismisses
 * after `duration` ms. Anchored bottom (or top) via the overlay layer — RN ships none built-in.
 */
export const Toast: Component<ToastProps> = (props) => {
  const isVisible = toAccessor(props.visible, false)

  // Auto-dismiss: (re)arm a timer whenever the toast is shown; clear it on hide/unmount/re-run.
  effect(() => {
    if (!isVisible()) return
    const ms = props.duration
    if (ms && ms > 0 && typeof setTimeout === 'function' && props.onDismiss) {
      const id = setTimeout(() => props.onDismiss?.(), ms)
      onCleanup(() => clearTimeout(id))
    }
  })

  return () => {
    if (!isVisible()) return null
    const atTop = props.position === 'top'
    const bubble = createElement(
      View,
      {
        role: props.role ?? 'status',
        style: () => ({
          backgroundColor: '#1f2430',
          borderRadius: 12,
          paddingTop: 12,
          paddingBottom: 12,
          paddingLeft: 16,
          paddingRight: 16,
          maxWidth: 480,
        }),
      },
      typeof props.message === 'string'
        ? createElement(Text, { style: () => ({ color: '#ffffff' }) }, props.message)
        : (props.children ?? props.message),
    )
    const container = createElement(
      View,
      {
        style: () => ({
          position: 'fixed',
          left: 0,
          right: 0,
          [atTop ? 'top' : 'bottom']: 0,
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          padding: 16,
        }),
      },
      bubble,
    )
    return portal(container, props.mount !== undefined ? { mount: props.mount } : undefined)
  }
}
