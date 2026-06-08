---
"@mindees/core": patch
---

Release-engineering hardening for a 1.0 (roadmap #7):

- **Cross-platform CI** — a new job runs build + CLI smoke + the test suite on **Windows and macOS** (the
  Linux-only matrix never exercised the path/shell-sensitive `create-mindees`/`cli` code, despite Windows
  being the primary dev OS).
- **`STABILITY.md`** — the explicit stability + deprecation policy: the 1.0 SemVer contract, what "public
  API" covers, the maturity levels, the announce → one-minor-support → remove-next-major deprecation
  lifecycle, and the supported Node range.
- **`Maturity`** gains a `'deprecated'` member for that lifecycle.
- **`engines.node >= 22.18.0`** added to every published package, so an unsupported runtime warns on install.
