---
"@mindees/updates": minor
---

Export the **Server-Driven UI** API from the package entry (it was implemented + tested but not
surfaced): `compileSdui` (allowlisted, schema-versioned JSON → live MindeesNode tree; no `eval`,
pre-registered components + actions), plus `applyMergePatch` (RFC 7396) and `applyJsonPatch` (RFC 6902)
for incremental UI deltas, and the `SduiRegistry`/`SduiLimits`/`SduiError` types. Pulse spec §10.
