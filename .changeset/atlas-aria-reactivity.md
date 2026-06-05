---
"@mindees/atlas": patch
---

Make accessibility state reactive. `A11yProps.state` now accepts an accessor (`() => ({ checked: on() })`)
that lowers to **reactive** `aria-*` bindings, and `valueNow`/`valueMin`/`valueMax` lower to
`aria-valuenow`/`-valuemin`/`-valuemax`. Previously state was read once, so a screen reader never heard
changes. Now: `Switch` updates `aria-checked` on toggle, `Chip` updates `aria-pressed` on selection,
and `ProgressBar` exposes a live `aria-valuenow` (it previously had a `progressbar` role with no value
at all). Added `pressed` to the accessibility state.
