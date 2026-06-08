---
"@mindees/atlas": patch
---

`createTabNavigator`'s returned component now accepts **per-render overrides** (`tabBarPosition`,
`tabBarStyle`) that win over the factory defaults — matching `createStackNavigator`'s ergonomics, so the
two navigator factories behave consistently (a pre-1.0 API-consistency fix from the integration review).
