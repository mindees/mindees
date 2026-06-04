/**
 * The example app's **real** UI — @mindees/core signals + @mindees/atlas primitives
 * driven by the @mindees/renderer (Helix) reconciler.
 *
 * Unlike a hand-written command script, this exercises the genuine pipeline: the
 * reconciler renders Atlas components against a {@link createNativeCommandBackend},
 * which emits the serializable {@link NativeCommand} stream the native host
 * (`MindeesNativeHost` + `AndroidViewRenderer`) materializes into real Android views.
 * State changes (a signal `set` from a button press) re-run the reconciler
 * synchronously, producing a minimal `updateText` batch — no full re-render.
 *
 * Bundled to a QuickJS-safe IIFE (see ../tsdown.config.ts) and loaded from the
 * app's assets. Regenerate with `pnpm run build:android-example-js` from the repo root.
 *
 * @module
 */

import { Button, Column, Row, Text } from '@mindees/atlas'
import { createElement as h, signal } from '@mindees/core'
import { createNativeCommandBackend, render } from '@mindees/renderer'

/** Must match the host's pre-registered root id (see MainActivity.HOST_ROOT_ID). */
const HOST_ROOT_ID = 'host-root'

/** The host bridge injected as a QuickJS global (see QuickJsMindeesRuntime). */
declare const MindeesHost: { emit(json: string): void }

const backend = createNativeCommandBackend({ rootId: HOST_ROOT_ID })

/** Send any buffered commands to the native host as one JSON batch. */
function flush(): void {
  const batch = backend.flushCommands()
  if (batch.length > 0) MindeesHost.emit(JSON.stringify(batch))
}

const count = signal(0)

// A curated palette so the rendered tree visibly exercises the renderer's style
// mapping (flex layout, padding/gap, background + radius, typography).
const palette = {
  screenBg: '#0b1021',
  cardBg: '#171c33',
  accent: '#5b8cff',
  accentText: '#ffffff',
  resetBg: '#2a3050',
  heading: '#e8ecff',
  muted: '#9aa4d2',
}

/** The root component — a centered card with a heading, a live counter, and two buttons. */
function App() {
  return h(
    Column,
    {
      style: {
        padding: 24,
        gap: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.screenBg,
        flexGrow: 1,
      },
    },
    h(
      Column,
      {
        style: {
          backgroundColor: palette.cardBg,
          padding: 28,
          gap: 14,
          borderRadius: 20,
          alignItems: 'center',
          minWidth: 260,
        },
      },
      h(
        Text,
        { style: { fontSize: 22, fontWeight: 700, color: palette.heading } },
        'MindeesNative',
      ),
      h(
        Text,
        { style: { fontSize: 15, color: palette.muted } },
        'Real Atlas + Helix, rendered native',
      ),
      h(
        Text,
        { style: { fontSize: 40, fontWeight: 800, color: palette.accent, paddingTop: 8 } },
        // A reactive text child: re-runs only this node's text on count change.
        () => `Count: ${count()}`,
      ),
      h(
        Row,
        { style: { gap: 12, justifyContent: 'center', paddingTop: 8 } },
        h(Button, {
          title: 'Increment',
          onPress: () => count.set(count() + 1),
          style: {
            backgroundColor: palette.accent,
            color: palette.accentText,
            paddingTop: 12,
            paddingBottom: 12,
            paddingLeft: 20,
            paddingRight: 20,
            borderRadius: 12,
            fontWeight: 600,
          },
        }),
        h(Button, {
          title: 'Reset',
          onPress: () => count.set(0),
          style: {
            backgroundColor: palette.resetBg,
            color: palette.accentText,
            paddingTop: 12,
            paddingBottom: 12,
            paddingLeft: 20,
            paddingRight: 20,
            borderRadius: 12,
            fontWeight: 600,
          },
        }),
      ),
    ),
  )
}

/** The contract the native runtime calls: `start()` once, then `dispatchEvent` per native event. */
const api = {
  start(): void {
    render(h(App, null), backend, backend.root)
    flush()
  },
  dispatchEvent(handlerId: string): void {
    // Runs the registered handler (mutates a signal); the reconciler emits the
    // resulting minimal command batch synchronously, which we then flush.
    backend.dispatchEvent(handlerId)
    flush()
  },
}

;(globalThis as unknown as { MindeesApp: typeof api }).MindeesApp = api
