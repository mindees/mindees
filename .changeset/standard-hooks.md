---
"@mindees/atlas": minor
---

Add **standard utility hooks** — the batteries RN and Flutter make you reach for a library to get,
built in and renderer-agnostic (web + native): `useToggle` (boolean with toggle/on/off),
`useCounter` (bounded inc/dec/reset with min/max/step), `usePrevious` (the value before the latest
change), `useReducer` (signal-backed reducer), and `useAsync` (run a fetcher into reactive
`data`/`error`/`loading`, newest-run-wins with stale-result + dispose safety). Pure wrappers over the
reactive core — no extra dependencies.
