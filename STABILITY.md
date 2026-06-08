# Stability & deprecation policy

What "stable" means for MindeesNative, and how APIs change over time. This complements
[`GOVERNANCE.md`](./GOVERNANCE.md) (project governance) and [`RELEASING.md`](./RELEASING.md) (release
mechanics).

## Versioning

Every `@mindees/*` package shares **one locked version line** — they are released together at the same
version, so a given version is a coherent set. Versioning follows [SemVer](https://semver.org/).

### Pre-1.0 (the current `0.x` line)

Per SemVer, `0.x` makes **no stability promise**. We still minimize churn, but:

- **minor** (`0.Y.0`) may include new features **and** breaking changes;
- **patch** (`0.x.Z`) is reserved for fixes.

Breaking changes in `0.x` are called out in the changeset/release notes.

### 1.0 and after

`1.0.0` is the stability commitment. From then on:

- **major** (`X.0.0`) — breaking changes to stable, public API.
- **minor** (`x.Y.0`) — backward-compatible additions.
- **patch** (`x.y.Z`) — backward-compatible fixes.

"Public API" is every documented, exported symbol of a package's published entry points whose
[`maturity`](#maturity-levels) is `stable`. Internal helpers (marked `@internal`), `experimental` /
`research-track` surfaces, and anything not exported from a package's `exports` map are **not** covered and
may change in any release.

## Maturity levels

Each package self-reports a `maturity` (introspectable via its exported `info`). The `Maturity` union:

| level | meaning | covered by the 1.0 promise? |
|-------|---------|------------------------------|
| `stable` | production-ready; API frozen under SemVer | ✅ |
| `experimental` | usable, but the API may still change | ❌ |
| `research-track` | a real, labeled spike (e.g. native on-device) | ❌ |
| `planned` / `scaffold` | declared shape, not yet implemented | ❌ |
| `deprecated` | still works; scheduled for removal (see below) | ✅ until removed |

The whole framework is `experimental` until the 1.0 release flips the production-ready packages to
`stable` (the genuinely-unbuilt seams — native/AOT/on-device — stay `research-track`).

## Deprecation lifecycle

Once a symbol is `stable`, it is removed only through this path:

1. **Announce** — the replacement lands; the old symbol is marked `@deprecated` in its JSDoc (with the
   migration) and, where practical, emits a one-time dev-only runtime warning. Its package may report
   `maturity: 'deprecated'`.
2. **Support window** — the deprecated symbol keeps working for at least **one minor release**.
3. **Remove** — it is removed only in the **next major**, never in a minor or patch.

## Supported runtime

Published packages declare `engines.node >= 22.18.0` (Node 22 = Maintenance LTS, 24 = Active LTS as of
mid-2026). Older runtimes are unsupported. The browser target is current evergreen browsers (native ES
modules + import-maps).
