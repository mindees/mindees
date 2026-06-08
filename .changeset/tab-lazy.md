---
"@mindees/atlas": patch
---

`createTabNavigator` now **lazily mounts** each tab's screen on its first activation (then keeps it
alive), matching React Navigation's default: an unvisited tab's loaders and effects never run, while a
visited tab retains its state across switches.
