---
"@mindees/atlas": minor
---

Add a component library: **Card, Divider, Badge, Avatar, Chip, Switch, SafeAreaView,
KeyboardAvoidingView, ProgressBar** (determinate).

Each is composed purely from the existing primitives + device hooks — no new host
concepts — so they render on web *and* native today, and stay fine-grained: reactive
parts (Switch/Chip state, ProgressBar fill, SafeAreaView/KeyboardAvoidingView padding)
are accessor styles, so only the changed node updates, never a component re-render.

Defaults follow the 2026 UI/UX handbook: 8pt spacing, 12–16 corner radius, WCAG-AA tone
contrast (badge tones use -700 shades for ≥4.5:1 on white), and proper roles
(`separator`, `progressbar`, `switch`, `status`). Also adds the `separator` and
`progressbar` ARIA roles to `Role`.
