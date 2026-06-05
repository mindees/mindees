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

import { type Component, createElement, type MindeesNode, onCleanup, portal } from '@mindees/core'
import type { A11yProps, Role } from './a11y'
import type { Reactive } from './host'
import { Pressable, View } from './primitives'
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

/** A focus-scoped, `aria-modal` container. Captures + restores focus on web; declarative elsewhere. */
export const FocusScope: Component<FocusScopeProps> = (props) => {
  let restore: (() => void) | null = null
  const captureAndFocus = (host: unknown): void => {
    if (typeof document === 'undefined') return // native/headless: declarative only
    const node = host as { focus?: () => void } | null
    const doc = document as unknown as { activeElement?: { focus?: () => void } | null }
    const previous = doc.activeElement ?? null
    if (props.restoreFocus !== false && previous && typeof previous.focus === 'function') {
      restore = () => previous.focus?.()
    }
    if (props.autoFocus !== false && node && typeof node.focus === 'function') node.focus()
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
  if (props.onEscape !== undefined) {
    hostProps.onKeyDown = (e: unknown) => {
      if ((e as { key?: string }).key === 'Escape') props.onEscape?.()
    }
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
