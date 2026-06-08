# @mindees/atlas

The Atlas component library — MindeesNative's batteries-included UI primitives.

> Note: named `@mindees/atlas` (not `@mindees/ui`) because `@mindees/ui` is a
> separate, pre-existing React Native + Expo UI kit on npm. Atlas is this
> framework's own component library.

> Status: 🧪 **Experimental** (pre-1.0) — v0.13.0. A 27+ component library plus 12+
> hooks: accessible, signals-native UI primitives, design-token theming with dark
> mode, a full-screen portal/overlay layer, a virtualized recycling `List`, a
> gesture system, an animation engine, and an animated stack navigator over the
> Quantum router. Web rendering is real through the Helix DOM backend; the **same**
> serializable tree now renders + is interactive on a real Android emulator
> (QuickJS bridge) and a real iOS simulator (JavaScriptCore bridge), all CI-verified.
> See the repository [STATUS.md](../../STATUS.md).

## What works today

- **Primitives** — `View`, `Text`, `Image`, `TextInput`, `Pressable`, `Button`,
  `Stack`, `Row`, `Column`, `Spacer`, and `ScrollView` return renderer-agnostic
  `MindeesNode` trees over `@mindees/core` `createElement`.
- **Components (27+)** — beyond the primitives: `Card`, `Switch`, `Badge`, `Avatar`,
  `Chip`, `Divider`, `ProgressBar`, `ActivityIndicator`, `SafeAreaView`,
  `KeyboardAvoidingView`, `Checkbox`, `RadioGroup`, `Skeleton`, `Tabs`, `Accordion`,
  `Stepper`, and `SegmentedControl` — all accessible and signals-native.
- **Overlays** — `@mindees/atlas` exports `Modal`, `Toast`, and `FocusScope`; these
  render into a full-screen portal layer that overlaps the app (web today; the native
  hosts have a matching overlay layer).
- **Hooks (12+)** — state/effect hooks `useToggle`, `useCounter`, `usePrevious`,
  `useReducer`, `useAsync`, `usePersistentSignal`, `useDebounce`, `useInterval`,
  `useTimeout`, plus `useForm` and the device hooks `useWindowDimensions`,
  `useColorScheme`, `useSafeAreaInsets`, and `useKeyboard` (RN-parity environment).
- **Styling** — `StyleObject`, `StyleInput`, and `flattenStyle` normalize a curated
  cross-platform style subset; numeric web styles lower to `px` through the renderer.
- **Accessibility** — typed `role` / `aria-*` helpers lower into host props, and
  `Image` requires a `label` unless explicitly marked decorative.
- **Interaction** — `Pressable` and `usePressable` use real DOM events on web
  (`click`, pointer, focus, Enter, Space), with reactive hover/press/focus state.
- **Gestures + motion** — `GestureView` attaches pan/press gestures; `motion` /
  `animateTo` drive spring/interpolated animations on the same scene.
- **Theming** — design tokens in two tiers: primitive scales (`space`, `radius`,
  `fontSize`, `palette`, …) and semantic `tokens`/`Theme` (`bg`/`surface`/`text`/
  `primary`/…), all on the main entry. `useTheme` returns a reactive theme driven by
  `useColorScheme`, so **dark mode** is a fine-grained token-set swap — only the color
  nodes update. Every built-in component reads its colors via `useTheme`, so a token
  swap re-themes them automatically.
- **List** — `@mindees/atlas/list` exports `List`, `createList`, and `computeWindow`.
  It renders a fixed pool of recycled row regions for fixed-height virtualization;
  variable-height measurement is a 🔬 research track.
- **Keyed iteration** — `@mindees/atlas/for` exports `For`, a keyed region for
  efficient list reconciliation (reused/disposed by key).
- **Stack navigator** — `@mindees/atlas/stack` exports `createStackNavigator`, an
  animated stack over the Quantum router: push slides/fades a screen in, an edge
  swipe-back gesture drives the pop interactively, and surviving screens keep state.
- **Tab navigator** — `@mindees/atlas/tab` exports `createTabNavigator`: the active
  tab is derived from the URL (deep-links + back/forward work), every screen stays
  mounted (state preserved), with full `tablist`/`tab`/`tabpanel` a11y.

## Quick start

```ts
import { Button, Column, Text, useTheme } from '@mindees/atlas'
import { List } from '@mindees/atlas/list'

const theme = useTheme() // reactive; tracks color-scheme (dark mode) automatically
const primary = () => theme().color.primary

export const Screen = Column({
  gap: 12,
  children: [
    Text({ children: 'One Atlas tree — web, Android, and iOS.' }),
    Button({ title: 'Save', style: () => ({ backgroundColor: primary(), padding: 12 }) }),
    List({
      items: ['One', 'Two', 'Three'],
      height: 120,
      itemHeight: 40,
      renderItem: (item) => Text({ children: item }),
    }),
  ],
})
```

Design rationale: [ADR-0022](../../docs/adr/0022-atlas-primitives.md) and
[ADR-0023](../../docs/adr/0023-atlas-list.md).

## License

`MIT OR Apache-2.0`
