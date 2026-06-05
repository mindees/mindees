---
"@mindees/atlas": minor
"@mindees/renderer": minor
---

Add `ActivityIndicator` — a spinning loading indicator. It emits a dedicated
`activityindicator` host element that each backend renders natively: the **DOM backend**
builds a CSS keyframe spinner (keyframes injected once per document; size from
`width`/`height`, the arc from `color`), and the Android host renderer maps it to an
indeterminate `ProgressBar` (with `color` → tint). Size/color flow through ordinary style
keys; defaults to the theme primary; `animating={false}` renders nothing.
