# ADR-0022: Atlas (Phase 12) — UI primitives, style & theme

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

`@mindees/atlas` was a bare scaffold. Phase 12 makes it the **UI primitive** layer:
accessible, signals-native building blocks that produce renderer-agnostic `MindeesNode` trees.
Web rendering is real (the Helix DOM backend); native is a labeled 🔬 research track (the same
serializable tree, interpreted by a native host later). The virtualized list (the hard part) is
a separate sub-phase (ADR-0023). Atlas is **not** `@mindees/ui` (the user already publishes
that distinct package on npm).

## Decision

### Authoring model — function components over `createElement`
Every primitive is a `Component<P>` from `@mindees/core` returning `createElement(tag, host,
children)`. No JSX required at the primitive layer; `children` stays the core `MindeesNode`
union (incl. the `() => MindeesNode` reactive-region form). This matches the router's
`createLink`/`createRouterView` house style and keeps Atlas renderer-agnostic — it constructs
trees and never imports the renderer (which is a **peer + dev** dependency; `@mindees/core` is
the only runtime dep).

### One curated, cross-platform `StyleObject`
The renderer already applies one `style` **object** on both the DOM backend (inline styles) and
the native-command backend (a serialized prop), so one object is the whole cross-platform style
vehicle. `StyleObject` is a hand-curated subset meaningful on web **and** native (flexbox, box,
visual, text); `flattenStyle` merges a `StyleInput` (style or nested array with falsy entries
dropped) so conditional styles compose. `unsafeStyle` is the explicit escape hatch.

**Numbers are px on web, dp on native** — handled in the renderer, not Atlas: the DOM backend
now appends `px` to a numeric value on non-unitless properties (React-DOM's `isUnitlessNumber`
convention). So `{ width: 12 }` stays a number in the agnostic tree, renders `12px` on web, and
reaches native raw. (Nullish/non-finite style values are unset, never written as the literal
string `"undefined"`/`"NaN"`.) The DOM backend also now writes form-control props
(`value`/`checked`/…) as the live DOM **property** (not an attribute), so a controlled
`TextInput` actually updates after the user edits — both small renderer fixes shipped here.

### `Reactive<T>` props
A prop value may be `T | Accessor<T>`; a function value becomes a fine-grained binding (the
renderer wraps it in an effect). Primitives accept `Reactive<StyleInput>` so press/hover/focus
restyling re-patches only the style attribute, never the subtree.

### Accessibility lowered to `role` + `aria-*`
A single typed `A11yProps` (`role`, `label`, `labelledBy`/`describedBy`, `live`, `state`) is
lowered by `toA11yProps` to `role` + `aria-*` attribute props — real on web (the DOM backend
passes them through), carried (not dropped) toward native. Defaults are accessible (`Pressable`
→ `role="button"` + keyboard operable; `Image` requires `label` unless `decorative`).

### Interaction without a synthetic event system
`usePressable` owns `hovered`/`pressed`/`focused` signals driven by **real** host events; a
`Pressable` `style` may be a `(state) => StyleObject` function lowered to a single reactive
accessor. Critically, the public `onPress` is invoked from a real DOM `onClick` (+ `keydown`
Enter/Space) — **never** a fake cross-platform `onPress` host prop, because the renderer
lowercases `onPress`→`'press'`, which is not a real DOM event and would silently never fire.

### Theme as a structural interface, not a dependency
`ThemeTokens` is an interface + a minimal `defaultTokens`, consumed via a `@mindees/core`
selector-isolated context (`createTheme().select(t => …)`). External tokens (the user's
`@mindees/tokens`) can satisfy the shape and be injected; Atlas takes no tokens dependency.
On the `@mindees/atlas/theme` subpath.

## Consequences

- Primitives (`View`/`Text`/`Image`/`TextInput`/`Pressable`/`Button`/`Stack`/`Row`/`Column`/
  `Spacer`/`ScrollView`) + style/a11y/theme, all headless-testable by asserting the returned
  `MindeesNode` tree. Maturity scaffold → experimental.
- A small renderer enhancement (numeric→px) benefits every consumer.
- The virtualized `List` follows in ADR-0023 on the `@mindees/atlas/list` subpath.

## Alternatives considered

- **className/CSS-first styling** — rejected: not cross-platform; the renderer's `style` object
  is the one channel both backends already honor.
- **Atlas stringifies px itself** — rejected: Atlas trees are platform-agnostic and can't know
  the target; numeric→px belongs in the web backend (native keeps raw numbers).
- **A fake cross-platform `onPress` host prop** — rejected: it silently no-ops on web; wire
  real DOM events and invoke an Atlas-level callback.
