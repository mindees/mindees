# @mindees/atlas

## 0.32.0

### Patch Changes

- @mindees/core@0.32.0
- @mindees/router@0.32.0

## 0.31.1

### Patch Changes

- bbde774: `createTabNavigator`'s returned component now accepts **per-render overrides** (`tabBarPosition`,
  `tabBarStyle`) that win over the factory defaults — matching `createStackNavigator`'s ergonomics, so the
  two navigator factories behave consistently (a pre-1.0 API-consistency fix from the integration review).
  - @mindees/core@0.31.1
  - @mindees/router@0.31.1

## 0.31.0

### Patch Changes

- @mindees/core@0.31.0
- @mindees/router@0.31.0

## 0.30.4

### Patch Changes

- 1c71e3a: `createTabNavigator` now composes with the router. Each tab screen receives the full
  `RouteComponentProps` contract — `router`, reactive `params`/`search`, and `data` for the active route's
  loader — the same props `createRouterView` passes, so a tab screen reads params and loader data the
  standard way (previously it was called with no props, so params/data were unavailable). `TabDef.component`
  is typed `Component<RouteComponentProps>` accordingly.

  Documented the v1 web limitations surfaced by the integration review (STATUS.md): static assets aren't
  bundled, file-based routing isn't wired for the no-bundler web target, nested routes under a tab render via
  the tab's own `createRouterView`, and an overlay opened inside a tab should be closed on tab change.

  - @mindees/core@0.30.4
  - @mindees/router@0.30.4

## 0.30.3

### Patch Changes

- @mindees/core@0.30.3
- @mindees/router@0.30.3

## 0.30.2

### Patch Changes

- 210b37e: Harden the a11y + tab features after an adversarial review (3 defects):

  - **Modal focus trap (high):** the trap's focusable query had no visibility filter, so a `display:none`
    focusable — e.g. a tab navigator's inactive, kept-alive panel inside a `Modal` — became a false Tab
    boundary and let focus escape the dialog. The trap now skips hidden focusables (inline
    `display:none`/`hidden`/`aria-hidden` up to the scope, plus no-box elements in real browsers).
  - **`announce` (medium):** two calls in the same frame dropped the first (shared region, last-write-wins).
    Same-frame messages are now queued and announced together (none lost).
  - **`createTabNavigator` (medium):** a URL matching no tab falsely selected/showed tab 0. It now selects
    and shows nothing (no `aria-selected`, no visible panel) when the URL belongs to no tab.
  - @mindees/core@0.30.2
  - @mindees/router@0.30.2

## 0.30.1

### Patch Changes

- 2d654a2: `createTabNavigator` now **lazily mounts** each tab's screen on its first activation (then keeps it
  alive), matching React Navigation's default: an unvisited tab's loaders and effects never run, while a
  visited tab retains its state across switches.
  - @mindees/core@0.30.1
  - @mindees/router@0.30.1

## 0.30.0

### Minor Changes

- bc6495d: **Tab navigator** (roadmap #8 — mobile-parity navigation). New `@mindees/atlas/tab` exports
  `createTabNavigator(router, { tabs })`:

  - The **active tab is derived from the URL** (longest matching tab path), so deep-links and
    back/forward navigation Just Work — no separate tab state to keep in sync.
  - **Every screen stays mounted**, so each tab's state (scroll, form input, in-flight data) is preserved
    across switches; only visibility toggles.
  - Full **ARIA** `tablist`/`tab` (`aria-selected`)/`tabpanel` semantics; an inactive panel is
    `display:none`, which also removes it from the a11y tree and tab order.

  Joins `createStackNavigator` (`@mindees/atlas/stack`) for router-backed navigation.

### Patch Changes

- @mindees/core@0.30.0
- @mindees/router@0.30.0

## 0.29.0

### Minor Changes

- d304221: **Accessibility: imperative `announce()` + a real modal focus trap** (roadmap #8 — WCAG gaps).

  - `announce(message, politeness?)` — programmatically voice a message to screen readers (results counts,
    "Saved", validation errors) via a persistent visually-hidden `aria-live` region (one per `'polite'`/
    `'assertive'`, reused; clears-then-sets so an identical message re-announces). SSR/native-safe.
  - `FocusScope` (and therefore `Modal`) now **traps Tab** within the scope — Tab from the last focusable
    wraps to the first, Shift+Tab from the first wraps to the last (WCAG 2.4.3), so keyboard focus can no
    longer escape an open dialog. It already captured + restored focus; this closes the documented gap.

### Patch Changes

- @mindees/core@0.29.0
- @mindees/router@0.29.0

## 0.28.0

### Patch Changes

- 85ce3e5: Harden the web build + Image after an adversarial review of the shipped web-run-loop (two real defects):

  - **compiler/cli:** the relative-import `.js` rewrite was a regex that **corrupted** valid code — it
    injected `.js` into a concatenated dynamic import (`import('./p/' + name)` → `import('./p/.js' + name)`),
    mangled import-like text inside string literals, and turned a directory/barrel import (`./widgets`) into
    `./widgets.js` (404) instead of `./widgets/index.js`. Replaced with a new **AST-based**
    `rewriteImportSpecifiers` (exported from `@mindees/compiler`): it touches only real import/export and
    single-string-literal dynamic-import specifiers, and the CLI resolves directory imports to `/index.js`
    against the compiled source set.
  - **atlas:** `Image` `fallbackSrc` looped forever — the live `src` is an absolute URL that never equals the
    literal fallback, so it re-swapped and re-fired `onError` on every error event. It now swaps exactly once
    (guarded by a marker). A multiline `TextInput` also no longer emits a stray `type` attribute on the `<textarea>`.
  - @mindees/core@0.28.0
  - @mindees/router@0.28.0

## 0.27.2

### Patch Changes

- Updated dependencies [9040462]
  - @mindees/core@0.27.2
  - @mindees/router@0.27.2

## 0.27.1

### Patch Changes

- @mindees/core@0.27.1
- @mindees/router@0.27.1

## 0.27.0

### Minor Changes

- 1ecaaa1: **Table-stakes `TextInput` + `Image` props** (roadmap #5) — you can now build real login/checkout/comment
  screens and image-heavy lists.

  - **TextInput:** `multiline` (renders a real `<textarea>` with `rows`), `secureTextEntry` (→ password),
    `keyboardType` (→ `inputmode`), `returnKeyType` (→ `enterkeyhint`), `autoCapitalize`, `autoComplete`,
    `maxLength`, `autoFocus`, `onFocus`/`onBlur`, and `onSubmitEditing` (fires on Enter with the value).
  - **Image:** `resizeMode` (→ CSS `object-fit`), `loading` (lazy), `decoding`, `fetchPriority`,
    intrinsic `width`/`height` (reserve layout space), `onLoad`/`onError`, and `fallbackSrc` (swaps the
    element's `src` on a load error). The native disk/memory cache stays a host contract (deferred).

### Patch Changes

- @mindees/core@0.27.0
- @mindees/router@0.27.0

## 0.26.0

### Minor Changes

- d39954d: **Live device hooks on the web target** (roadmap #4). The platform environment signals (`useColorScheme`,
  `useWindowDimensions`, `useSafeAreaInsets`, `useKeyboard`, `useReducedMotion`) previously had no web
  wiring — they kept inert defaults (0×0, light, no insets, keyboard hidden) on the framework's primary
  target, so three advertised RN-parity capabilities silently no-op'd.

  - **atlas:** new `connectWebEnvironment(window?)` subscribes `prefers-color-scheme` (dark mode),
    `prefers-reduced-motion`, `resize` + `devicePixelRatio` (dimensions/scale), `visualViewport` (soft
    keyboard height), and `env(safe-area-inset-*)` (via a hidden probe) — pushing each through
    `setEnvironment` as a fine-grained signal write. SSR-safe (no-op without a DOM); returns a `disconnect()`.
  - **cli:** the `atlas` scaffold template's `main.tsx` now calls `connectWebEnvironment()`, so a freshly
    created app has live dark-mode/safe-area/keyboard hooks with zero config.

### Patch Changes

- @mindees/core@0.26.0
- @mindees/router@0.26.0

## 0.25.0

### Minor Changes

- 1136c25: Resolve API-consistency contradictions ahead of a 1.0 freeze (roadmap #3):

  - **atlas:** removed the orphaned `@mindees/atlas/theme` subpath (`createTheme`/`ThemeContext`/`ThemeTokens`).
    **No built-in component ever read it** — every component themes via `useTheme`/`tokens` (the main entry),
    which stays the single, working theming system (reactive, dark-mode aware). Shipping two incompatible
    theming APIs into 1.0 would have been a trap; this leaves exactly one. **Breaking:** import `useTheme`/
    `tokens` from `@mindees/atlas` instead of `createTheme` from `@mindees/atlas/theme`.
  - **router:** `info` is now `Object.freeze`d, matching the frozen package-identity invariant every other
    `@mindees/*` already upholds.

### Patch Changes

- Updated dependencies [1136c25]
  - @mindees/router@0.25.0
  - @mindees/core@0.25.0

## 0.24.0

### Patch Changes

- @mindees/core@0.24.0
- @mindees/router@0.24.0

## 0.23.0

### Patch Changes

- @mindees/core@0.23.0
- @mindees/router@0.23.0

## 0.22.8

### Patch Changes

- Updated dependencies [8de302d]
  - @mindees/core@0.22.8
  - @mindees/router@0.22.8

## 0.22.7

### Patch Changes

- Updated dependencies [3a3bcae]
  - @mindees/core@0.22.7
  - @mindees/router@0.22.7

## 0.22.6

### Patch Changes

- Updated dependencies [34605e2]
  - @mindees/core@0.22.6
  - @mindees/router@0.22.6

## 0.22.5

### Patch Changes

- Updated dependencies [bed575f]
  - @mindees/core@0.22.5
  - @mindees/router@0.22.5

## 0.22.4

### Patch Changes

- Updated dependencies [6782bee]
  - @mindees/core@0.22.4
  - @mindees/router@0.22.4

## 0.22.3

### Patch Changes

- Updated dependencies [7a7d7b7]
  - @mindees/router@0.22.3
  - @mindees/core@0.22.3

## 0.22.2

### Patch Changes

- 9282b43: Fix seven correctness bugs found by a second adversarial bug-hunt (toward stable v1), each with a regression test:

  - **router (file routes):** a dynamic/catch-all **directory** name (`posts/[id]/…`) was left literal `[id]`, so
    every Expo-style nested dynamic route was dead — now mapped to `:id`/`:x*` like file names.
  - **compiler (transform):** the auto JSX-runtime import no longer **duplicates** a `createElement`/`Fragment`
    already bound by another import or a local declaration (which produced a module that crashes on load).
  - **compiler (route codegen):** `generateRouteModule` now JSON-escapes the import specifier — a filename with a
    quote no longer emits a non-parsing module.
  - **core (animation):** a throwing `onComplete` can no longer **freeze every animation** — the completion
    callback is isolated and the rAF chain always re-arms.
  - **cli (create):** drive-relative / versioned paths (`C:foo`, `app:1.0`) are rejected up front instead of
    crashing `mkdir` (the CLI's "never throws" contract).
  - **renderer (SSR):** HTML **void elements** (`img`/`input`) serialize without a closing tag/children, so
    crawlable markup round-trips to the same tree the reconciler builds.
  - **atlas (Accordion):** `defaultOpen` now respects single-open mode from the first frame.

- Updated dependencies [9282b43]
  - @mindees/router@0.22.2
  - @mindees/core@0.22.2

## 0.22.1

### Patch Changes

- 57a45ee: Fix six correctness bugs found by an adversarial bug-hunt (toward stable v1), each with a regression test:

  - **renderer (Canvas2D):** `insert` now has move-semantics (detach before insert) — reordering a keyed
    list no longer **duplicates** the moved node in the scene graph (matched the headless/native/DOM backends).
  - **data (Continuum sync):** a migrated whole-value (primitive/array) record is now resolved by HLC — a
    strictly-newer per-field set **supersedes** it instead of being silently masked, fixing data loss and a
    CvRDT **divergence** between a migrated and a fresh replica.
  - **data (IndexedDB persistence):** a transient `open` failure is no longer cached forever — the next
    `load`/`save` **retries** instead of the handle being bricked for the session.
  - **atlas (useForm):** `handleSubmit` guards against **double submission** while a submit is in flight;
    `isValid()` is now derived from the schema against current values (correct before the first validate()).
  - **core (createElement):** an array passed via the `children` prop is used as-is (no **double-wrap**), so
    `element.children` has one consistent shape regardless of how children were supplied.

- Updated dependencies [57a45ee]
  - @mindees/core@0.22.1
  - @mindees/router@0.22.1

## 0.22.0

### Patch Changes

- @mindees/core@0.22.0
- @mindees/router@0.22.0

## 0.21.0

### Patch Changes

- @mindees/core@0.21.0
- @mindees/router@0.21.0

## 0.20.0

### Patch Changes

- @mindees/core@0.20.0
- @mindees/router@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [e8622ed]
  - @mindees/core@0.19.0
  - @mindees/router@0.19.0

## 0.18.0

### Patch Changes

- @mindees/core@0.18.0
- @mindees/router@0.18.0

## 0.17.0

### Minor Changes

- fc35a95: Add **`Show`** — the ergonomic conditional control-flow component. Renders `children` when `when`
  (value or accessor) is truthy, else `fallback`; a function child receives the **narrowed** truthy value.
  A reactive region that swaps content as the condition flips.

### Patch Changes

- @mindees/core@0.17.0
- @mindees/router@0.17.0

## 0.16.0

### Minor Changes

- 7ce23b5: Add **`ErrorBoundary`** — catch errors thrown while rendering a subtree and show a `fallback(error, reset)`
  instead of failing the whole app (RN/React's `<ErrorBoundary>`, signals-native). `reset()` retries; a
  tracked signal read before the throw also re-runs the boundary when it changes. Catches synchronous
  render-time errors.

### Patch Changes

- @mindees/core@0.16.0
- @mindees/router@0.16.0

## 0.15.0

### Minor Changes

- 41b2999: Add **`useReducedMotion`** + a `reducedMotion` field on the platform environment — a reactive accessor
  for the user's reduced-motion accessibility preference, so apps/animations can honor it (e.g. shorten or
  skip transitions). Set via `setEnvironment({ reducedMotion })` from the host (web `prefers-reduced-motion`
  / native OS setting).

### Patch Changes

- @mindees/core@0.15.0
- @mindees/router@0.15.0

## 0.14.0

### Patch Changes

- @mindees/core@0.14.0
- @mindees/router@0.14.0

## 0.13.0

### Minor Changes

- 79c3f7e: Add **`usePersistentSignal`** — a reactive signal that restores from + auto-saves to a key/value store
  (web `localStorage` by default; inject any `SignalStorage` for native), so persisting theme/prefs/UI
  state is one call. Corrupt payloads fall back to the initial value; storage errors are swallowed.
- 019d31c: Add timer hooks **`useDebounce`** (a debounced view of a reactive source — e.g. search-as-you-type),
  **`useInterval`** (repeating callback; `null` to pause), and **`useTimeout`** (one-shot; `null` to
  cancel) — all auto-clear on dispose. More batteries RN/React make you install a library for.

### Patch Changes

- @mindees/core@0.13.0
- @mindees/router@0.13.0

## 0.12.0

### Minor Changes

- 1ed00c2: Add **`Stepper`** (−/+ numeric stepper with min/max/step) and **`SegmentedControl`** (compact connected
  single-select) components — both RN ships none of built-in (tenet #8). Flex-only + accessible
  (`role="group"` / `radiogroup`+`radio`), so they render on web and native alike and stay fine-grained.
- 1ed00c2: Add a **`Toast`** (Snackbar) component — a portal-backed transient notification, controlled by `visible`
  with optional `duration` auto-dismiss, anchored bottom/top, `role="status"` (or `alert`). RN ships none
  built-in (tenet #8).

### Patch Changes

- @mindees/core@0.12.0
- @mindees/router@0.12.0

## 0.11.0

### Patch Changes

- @mindees/router@0.11.0
- @mindees/core@0.11.0

## 0.10.0

### Patch Changes

- @mindees/router@0.10.0
- @mindees/core@0.10.0

## 0.9.0

### Minor Changes

- cf5e632: Add **`Tabs`** and **`Accordion`** components (RN ships neither built-in). Both compose from primitives
  (web + native), are accessible (`role="tablist"`/`"tab"`/`"tabpanel"`; `aria-expanded` headers), and
  stay fine-grained — switching a tab or toggling a section re-runs only that panel region. `Tabs`
  (controlled, with content panels), `Accordion` (single- or multi-open, `defaultOpen`, lazy panels).

### Patch Changes

- @mindees/core@0.9.0
- @mindees/router@0.9.0

## 0.8.0

### Minor Changes

- f85bbec: Add **`Checkbox`**, **`RadioGroup`**, and **`Skeleton`** components — common UI building blocks RN
  ships none of built-in. All compose from existing primitives (so they render on web + native today),
  are accessible (`role="checkbox"`/`"radio"`/`"radiogroup"`/`"status"` with reactive `aria-checked`),
  and stay fine-grained (reactive accessor styles). `Checkbox` (controlled, optional label), `RadioGroup`
  (single-select string options), `Skeleton` (aria-busy loading placeholder).
- 49a0317: Add **`useForm`** — a built-in form-state hook with **Standard Schema** validation (Zod/Valibot/
  ArkType/…), the thing RN and Flutter make you reach for react-hook-form / formik to get. Signal-backed
  `values`/`errors`/`touched` (a field binding re-renders only itself), `field(name)` bindings
  (value/error/touched/set/onBlur), `validate()`, `handleSubmit()` (validates, marks all touched, calls
  `onSubmit` only if valid), `reset()`, and reactive `isValid`/`isSubmitting`. Validation is synchronous
  (an async schema is rejected, mirroring the router) and maps each issue to its field by path.
- f85bbec: Add **standard utility hooks** — the batteries RN and Flutter make you reach for a library to get,
  built in and renderer-agnostic (web + native): `useToggle` (boolean with toggle/on/off),
  `useCounter` (bounded inc/dec/reset with min/max/step), `usePrevious` (the value before the latest
  change), `useReducer` (signal-backed reducer), and `useAsync` (run a fetcher into reactive
  `data`/`error`/`loading`, newest-run-wins with stale-result + dispose safety). Pure wrappers over the
  reactive core — no extra dependencies.

### Patch Changes

- @mindees/core@0.8.0
- @mindees/router@0.8.0

## 0.7.0

### Patch Changes

- @mindees/core@0.7.0
- @mindees/router@0.7.0

## 0.6.0

### Minor Changes

- 64d261f: Add **`createStackNavigator`** (new `@mindees/atlas/stack` subpath) — animated stack navigation over
  the Quantum router, composing the keyed reconciler + animation engine + gesture system (RN stack
  navigator / Flutter Navigator parity).

  - Drop-in superset of `createRouterView`: `const Stack = createStackNavigator(router); render(Stack(), …)`.
  - Pushing a route **slides/fades** the new screen in over the old; back reverses it; an **edge
    swipe-back** gesture drives the pop interactively (release past a threshold completes it with a
    velocity-seeded spring, else cancels).
  - Transitions: `'slide'` (default), `'fade'`, `'none'`, or a custom `StackInterpolator`
    (`cardStyleInterpolator` parity); per-screen via `route.meta`.
  - Reuses the keyed reconciler (surviving screens are reused, departed ones disposed when their key
    leaves the rendered set); ONE progress `AnimatedValue` drives both cards via `interpolate` (one
    batch/frame, glitch-free). No frame source (SSR/headless) → the destination renders instantly.

  v1 limitation: a navigation that changes only params/search of the current screen snaps (remounts);
  full in-screen param-state preservation is a follow-up.

### Patch Changes

- @mindees/router@0.6.0
- @mindees/core@0.6.0

## 0.5.0

### Minor Changes

- 503be19: Add an **animation system** — RN `Animated`/Reanimated + Flutter `AnimationController` parity, built
  entirely on the reactive core.

  - **`@mindees/core`**: `animate(initial)` returns an `AnimatedValue` that **is a reactive accessor**
    (read it in a `style` fn → only that node re-renders, no renderer surface). Drive it with
    `timing(av, { to, duration, easing })` or `spring(av, { to, stiffness, damping })`; `interpolate`
    maps a value through ranges; `cubicBezier` + named easings. One injected `FrameSource`
    (`setFrameSource` — mirroring `setReactiveScheduler`; `rafFrameSource()` for web, `manualFrameSource()`
    for tests, vsync for native) drives a single loop that ticks all animations in **one `batch` per
    frame** (glitch-free). With **no frame source** (SSR/headless), animations jump to their final value
    synchronously — deterministic, never a hang. Animations started in a component scope auto-stop on
    unmount; springs have a stability cap; `done` + `onComplete` settle exactly once.
  - **`@mindees/atlas`**: `motion` (the easing tokens as ready easing fns) + `animateTo` (timing with
    the standard duration/easing token defaults).

- 4d1707d: Add a **gesture system** — RN Gesture Handler / Flutter GestureDetector parity, built on the reactive
  core and composing with the animation engine.

  - **`@mindees/core`**: `tap`, `longPress`, `pan`, `pinch`, `swipe` recognizer factories. Each returns
    `{ handlers, state, reset }` — spread `handlers` (`onPointerDown/Move/Up/Cancel`) onto an element,
    read `state` (reactive signals: pan's `translationX/Y` + `velocityX/Y`, pinch's `scale`/`focal`, …)
    in a `style` accessor. `composeGestures([...])` merges recognizers onto one element (required since
    the renderer binds a single listener per event). `panAnimated(x, y, { release })` is the headline:
    drag follows the finger and **springs to a target seeded with the gesture velocity** on release.
    Platform differences live only in `normalizePointer` (web PointerEvent + native payload); an
    injectable clock makes long-press deterministic; SSR-safe (pure payload → signal).
  - **`@mindees/atlas`**: `GestureView` — attach a recognizer to a view (handlers wired, auto-`reset`
    on unmount).

  Native multi-touch payload wiring is a documented research-track follow-up; an explicit exclusive
  gesture arena (beyond per-recognizer slop disambiguation) is a follow-up.

### Patch Changes

- Updated dependencies [503be19]
- Updated dependencies [4d1707d]
- Updated dependencies [4591937]
- Updated dependencies [f8318f9]
  - @mindees/core@0.5.0

## 0.4.0

### Minor Changes

- ea9915f: Add a portal primitive + `Modal`/`FocusScope` (the last core RN-parity gap).

  - **`@mindees/core`**: `portal(children, { mount? })` + `isPortal` + the `PortalRegion` node type.
    A serializable description; children relocate to an overlay layer while staying owned by the
    logical tree (so reactive disposal still unmounts them).
  - **`@mindees/renderer`**: `bindPortalChild` (a `mountNode` branch) mounts portal children into
    `HostBackend.overlayRoot()` — a new **optional** backend method (DOM lazily creates one
    `data-mindees-overlay` layer on `<body>`; the native command backend emits a dedicated `overlay`
    node; headless leaves it unset so portals mount in place — SSR-correct). Removal resolves each
    node's real parent (`parentOf`), since content lives in the overlay, not the logical parent. Also
    adds a minimal `ref: (hostNode) => void` prop (fired after insert) for host-node capture.
  - **`@mindees/atlas`**: `Modal` (portal + dismissable scrim + Escape + a focus-scoped dialog gated
    by a reactive `visible`) and `FocusScope` (captures + restores focus on web, `role="dialog"` +
    `aria-modal`; declarative on native — true focus trap/back-button are a host follow-up).

  Covered by portal reconciler tests (relocation, sibling ordering, dispose-no-leak, gating toggle,
  reactive children, in-place fallback) and DOM Modal tests (overlay placement + a11y, scrim/Escape
  close, focus restore).

### Patch Changes

- 3989e97: Make accessibility state reactive. `A11yProps.state` now accepts an accessor (`() => ({ checked: on() })`)
  that lowers to **reactive** `aria-*` bindings, and `valueNow`/`valueMin`/`valueMax` lower to
  `aria-valuenow`/`-valuemin`/`-valuemax`. Previously state was read once, so a screen reader never heard
  changes. Now: `Switch` updates `aria-checked` on toggle, `Chip` updates `aria-pressed` on selection,
  and `ProgressBar` exposes a live `aria-valuenow` (it previously had a `progressbar` role with no value
  at all). Added `pressed` to the accessibility state.
- Updated dependencies [ea9915f]
  - @mindees/core@0.4.0

## 0.3.0

### Minor Changes

- 0cf8168: Add `ActivityIndicator` — a spinning loading indicator. It emits a dedicated
  `activityindicator` host element that each backend renders natively: the **DOM backend**
  builds a CSS keyframe spinner (keyframes injected once per document; size from
  `width`/`height`, the arc from `color`), and the Android host renderer maps it to an
  indeterminate `ProgressBar` (with `color` → tint). Size/color flow through ordinary style
  keys; defaults to the theme primary; `animating={false}` renders nothing.
- 2eba52a: Add keyed list reconciliation — `For` (and the underlying `keyedRegion`/`bindKeyedChild`).

  The idiomatic `() => items().map(...)` tears down and rebuilds every row on any change, destroying
  host-node identity (focus, caret, scroll, input state) and, on native, emitting full dispose/create
  churn. `For` reconciles **by key**: existing rows are reused (their item/index signals patched in
  place), new keys created in their own reactive root, removed keys disposed, and host nodes moved with
  a longest-increasing-subsequence pass so the minimum number move (append → 0, adjacent swap → 1, full
  reverse → n−1). This delivers the spec's "O(what-changed), no diff storms, no FlatList cliff" promise.

  - **`@mindees/core`**: `keyedRegion(options)` + `isKeyedRegion` + the `KeyedRegion` node type (added to
    `MindeesNode`). A serializable description — no rendering logic — so it's renderer-agnostic.
  - **`@mindees/renderer`**: `bindKeyedChild` (the reconciler) + a `mountNode` branch ahead of the
    reactive-child path, so a `For` is never routed to the full-rebuild binding. `mountNode` is now exported.
  - **`@mindees/atlas`**: `For` on the `@mindees/atlas/for` subpath — the ergonomic component
    (default key = item identity; optional `key`/`fallback`). Complements the virtualized `List`.

  Covered by reconciler tests (identity across reorder/reverse/append, in-place patch with no sibling
  re-runs, scoped disposal, duplicate/null-key guards, fallback, identity keying) and a happy-dom test
  proving DOM focus survives a reorder.

### Patch Changes

- 716e035: Fix `List`/`SectionList` silently dropping a reactive (accessor) `style`. The scroll
  container eagerly `flattenStyle`-d the caller's style, which `Object.assign`-es a function to
  nothing — so a `style={() => ({...})}` was lost at runtime despite being typed as supported.
  The container now keeps the style reactive when the caller's is (merging the base
  height/position into the live accessor), so it updates fine-grained like every other style.
- Updated dependencies [2eba52a]
  - @mindees/core@0.3.0

## 0.2.0

### Minor Changes

- bee8227: Add a component library: **Card, Divider, Badge, Avatar, Chip, Switch, SafeAreaView,
  KeyboardAvoidingView, ProgressBar** (determinate).

  Each is composed purely from the existing primitives + device hooks — no new host
  concepts — so they render on web _and_ native today, and stay fine-grained: reactive
  parts (Switch/Chip state, ProgressBar fill, SafeAreaView/KeyboardAvoidingView padding)
  are accessor styles, so only the changed node updates, never a component re-render.

  Defaults follow the 2026 UI/UX handbook: 8pt spacing, 12–16 corner radius, WCAG-AA tone
  contrast (badge tones use -700 shades for ≥4.5:1 on white), and proper roles
  (`separator`, `progressbar`, `switch`, `status`). Also adds the `separator` and
  `progressbar` ARIA roles to `Role`.

- 0a61015: Add a design-token layer + theming (2026 UI/UX handbook §7–24, §31).

  - **Primitive scales**: `space` (8pt), `radius`, `fontSize` (1.25 type scale), `lineHeight`,
    `fontWeight`, `duration`/`easing` (motion), and color `palette` ramps — plus a `tokens`
    aggregate of the non-color scales.
  - **Semantic theming**: a `Theme` (`bg`/`surface`/`surfaceVariant`/`text`/`textMuted`/`border`/
    `primary`/`onPrimary`/`success`·`warning`·`danger`·`info`) with light & dark variants.
    **Dark mode is a token-set swap** (§23/§31): `useTheme()` returns a reactive theme driven by
    `useColorScheme()`, and `getTheme(scheme)` resolves one non-reactively.
  - **Components are now themed**: Card, Divider, Badge, Avatar, Chip, Switch, ProgressBar consume
    the theme, so they re-theme automatically light↔dark — fine-grained (only color nodes update),
    with WCAG-AA tone contrast in both modes.

- e254642: Add device hooks + a platform environment — the signal-backed equivalents of React
  Native's `useWindowDimensions`, `useColorScheme`, `useSafeAreaInsets`, and `Keyboard`.

  - **`useWindowDimensions()`**, **`useColorScheme()`**, **`useSafeAreaInsets()`**,
    **`useKeyboard()`** return Quantum-style reactive accessors, so reads are
    fine-grained — rotating the device or switching theme re-runs only the nodes that
    read that value, never the whole tree (RN re-renders the component).
  - **`setEnvironment(partial)`** / **`getEnvironment()`** — the host/runtime feeds the
    environment (on launch and on rotation/theme/keyboard changes); each field is a
    separate signal so updates stay isolated.

  Closes a real RN-parity gap (MindeesNative previously had no dimensions/appearance
  API). The Android example wires it end-to-end: the host injects window size + color
  scheme, and the home screen shows them live.

- 3e2ef33: Add `SectionList` (on the `@mindees/atlas/list` subpath) — a **virtualized** sectioned list
  built on `createList`. Sections are flattened to a single header/row entry stream and windowed,
  so only the visible headers and rows render (RN-parity `SectionList`, perf-optimized). Provides
  `SectionList`/`createSectionList`, `Section`, `SectionListOptions`, and the pure `flattenSections`
  helper. `renderSectionHeader` is optional (defaults to the section title); fixed row height in v1
  (headers share it), matching the List's current model.

### Patch Changes

- Updated dependencies [c29f76c]
  - @mindees/core@0.2.0

## 0.1.0

### Minor Changes

- bf948be: First public release — **v0.1.0**.

  MindeesNative's foundation is complete and audited: fine-grained reactivity, the
  component model + selector-isolated context, the priority scheduler and thread-pool
  abstraction (`@mindees/core`); the Helix renderer with web/DOM + headless backends,
  SSR/hydration, and a CI-verified native strand on iOS (JavaScriptCore) and Android
  (QuickJS) (`@mindees/renderer` + `examples/native-hosts`); the build-time optimizer
  (`@mindees/compiler`); the Forge CLI + `create-mindees` scaffolder; the Quantum typed
  router with data loaders, guards, and view transitions (`@mindees/router`); the Pulse
  signed-OTA + SDUI system (`@mindees/updates`); the Continuum local-first CRDT store +
  sync engine (`@mindees/data`); the Synapse AI gateway (`@mindees/ai`); and the Atlas
  accessible primitives + virtualized list (`@mindees/atlas`).

  APIs are 🧪 experimental (pre-1.0); see `STATUS.md`. This `minor` bump versions the
  whole locked `@mindees/*` line at `0.1.0`.

### Patch Changes

- c1acd04: Audit hardening for `@mindees/ai` (Synapse) and `@mindees/atlas`. An adversarial review confirmed seven defects (the structured-output/tool-calling allowlist, SSE framing, and mock/research stubs held up); each is fixed with a regression test.

  **@mindees/ai**

  - **Broken Anthropic auth via the mapper object (high)** — `createServerBackend` chose `x-api-key` auth only when `adapter` was the string `'anthropic'`; passing the exported `anthropicMapper` _object_ (supported public API) fell through to `Authorization: Bearer` + no `anthropic-version`, so Anthropic returned 401. Auth now follows the mapper (new `ProviderMapper.auth` field), so the name and object forms authenticate identically.
  - **OpenAI stream parser dropped finish/usage on a combined event (medium)** — when one SSE event carried a content delta _and_ `finish_reason`/`usage` (common in local OpenAI-compatible servers), the parser early-returned the text-delta and silently lost the terminal finish + token usage. `StreamParser` now returns an array, so an event can emit both the delta and the finish.
  - **Abort consistency (low ×2)** — `generate()` now re-checks the abort signal after the round-trip (matching `stream()`/`runTools`), and `stream()` checks the `[DONE]` sentinel before the abort poll so a completed stream never throws a spurious `ABORTED`.

  **@mindees/atlas**

  - **`ScrollView horizontal` was a no-op (medium)** — it only set an inert `data-orientation` attribute no backend reads. It now drives real horizontal layout through the curated style subset (`flexDirection: 'row'` + `overflow: 'auto'` + `flexWrap: 'nowrap'`).
  - **`Pressable` over-subscribed plain reactive styles (low)** — every function `style` was treated as an interaction-state fn, so an ordinary reactive style re-ran on every hover/press/focus. State-fns are now distinguished by arity, so a plain `() => StyleInput` accessor only re-runs on its own dependencies.
  - **Decorative `Image` kept a contradictory `aria-label` (low)** — a decorative image given both `decorative` and `label` emitted `aria-hidden="true"` _and_ `aria-label`; the label is now dropped so a decorative image exposes no accessible name.

  Both packages' exported `info` objects are now frozen (consistency).

- 86e5b94: Post-review hardening pass over the audit fixes (follow-ups confirmed with regression tests), plus a cross-package typecheck repair:

  - **`@mindees/renderer` — SSR element-tag injection (security)** — `serializeHeadless` interpolated the (possibly `mapTag`-mapped) tag into `<tag>`/`</tag>` unescaped, so a tag containing `>`/whitespace could break out and inject markup. The tag is now validated against the attribute-name grammar and rejected (fail closed) if unsafe.
  - **`@mindees/atlas` — `Pressable` style typecheck regression** — tightening `Accessor<T>` to a strict `() => T` left the 1-arg interaction-state style fn leaking into the `resolveStyle` branch. The arity-narrowed branch now asserts `Reactive<StyleInput>`, mirroring the state-fn cast, so the package typechecks again.
  - **`@mindees/atlas` — horizontal `ScrollView` layout was inert** — the row layout set `flexDirection`/`flexWrap` without `display: 'flex'`, so the element stayed in default block flow. `display: 'flex'` is now included.
  - **`@mindees/ai` — Anthropic streaming dropped `input_tokens`** — prompt tokens arrive on `message_start` while output tokens arrive on `message_delta`; the parser now carries `input_tokens` through to the finish chunk instead of reporting only output tokens.
  - **`@mindees/data` — HLC drift ceiling could ratchet** — the clamp ceiling is anchored to `physical + maxDriftMs` (not `max(localWall, physical) + maxDriftMs` re-added per merge), so repeated far-future merges can't walk the clock forward. The LWW same-stamp tie-break also tags `-0` distinctly from `+0` so a `-0`-vs-`+0` tie still converges.
  - **`@mindees/updates` — non-idempotent re-apply** — re-applying the already-current generation fell through and rewrote state, resetting `pendingVerification`/`bootAttempts` and un-confirming a generation that had already passed its readiness handshake. It now short-circuits to a true no-op.
  - **`@mindees/compiler` — marker collision missed destructuring** — the `_static` top-level collision check ignored destructuring bindings (`const { _static } = x`); it now recurses object/array binding patterns so flattening still bails on a real collision.
  - **`@mindees/cli` — overly specific scaffold error** — the unreadable-target message asserted "not a directory" for every `readDir` failure even though it could be a permission/I/O error; the message no longer claims a cause it didn't verify.

- Updated dependencies [43c3d33]
- Updated dependencies [bf948be]
  - @mindees/core@0.1.0
