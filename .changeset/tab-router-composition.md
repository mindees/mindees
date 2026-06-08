---
"@mindees/atlas": patch
---

`createTabNavigator` now composes with the router. Each tab screen receives the full
`RouteComponentProps` contract — `router`, reactive `params`/`search`, and `data` for the active route's
loader — the same props `createRouterView` passes, so a tab screen reads params and loader data the
standard way (previously it was called with no props, so params/data were unavailable). `TabDef.component`
is typed `Component<RouteComponentProps>` accordingly.

Documented the v1 web limitations surfaced by the integration review (STATUS.md): static assets aren't
bundled, file-based routing isn't wired for the no-bundler web target, nested routes under a tab render via
the tab's own `createRouterView`, and an overlay opened inside a tab should be closed on tab change.
