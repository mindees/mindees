# @mindees/atlas

The Atlas component library — MindeesNative's batteries-included UI primitives.

> Note: named `@mindees/atlas` (not `@mindees/ui`) because `@mindees/ui` is a
> separate, pre-existing React Native + Expo UI kit on npm. Atlas is this
> framework's own component library.

> Status: 🧪 **Experimental** — Phase 12A/12B are implemented and tested:
> accessible, signals-native UI primitives, a structural theme subpath, and a
> virtualized recycling `List`. Web rendering is real through the Helix DOM backend;
> native Atlas rendering is still tied to the broader native app bridge research track.
> See the repository [STATUS.md](../../STATUS.md).

## What works today

- **Primitives** — `View`, `Text`, `Image`, `TextInput`, `Pressable`, `Button`,
  `Stack`, `Row`, `Column`, `Spacer`, and `ScrollView` return renderer-agnostic
  `MindeesNode` trees over `@mindees/core` `createElement`.
- **Styling** — `StyleObject`, `StyleInput`, and `flattenStyle` normalize a curated
  cross-platform style subset; numeric web styles lower to `px` through the renderer.
- **Accessibility** — typed `role` / `aria-*` helpers lower into host props, and
  `Image` requires a `label` unless explicitly marked decorative.
- **Interaction** — `Pressable` and `usePressable` use real DOM events on web
  (`click`, pointer, focus, Enter, Space), with reactive hover/press/focus state.
- **Theme** — `@mindees/atlas/theme` exports `ThemeTokens`, `defaultTokens`, and
  `createTheme()`; token selection uses `@mindees/core` selector isolation.
- **List** — `@mindees/atlas/list` exports `List`, `createList`, and `computeWindow`.
  It renders a fixed pool of recycled row regions for fixed-height virtualization;
  variable-height measurement is a 🔬 research track.

## Quick start

```ts
import { Button, Column, Text } from '@mindees/atlas'
import { List } from '@mindees/atlas/list'
import { createTheme } from '@mindees/atlas/theme'

const theme = createTheme({ colors: { primary: '#2563eb' } })
const primary = theme.select((tokens) => tokens.colors.primary)

export const Screen = Column({
  gap: 12,
  children: [
    Text({ children: 'Atlas works on the Helix DOM backend today.' }),
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
