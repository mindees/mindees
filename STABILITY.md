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

As of **1.0**, the web stack is `stable` — `@mindees/core`, `@mindees/compiler`, `@mindees/cli`,
`@mindees/router`, `@mindees/renderer`, `@mindees/atlas`. `@mindees/ai`, `@mindees/data`, and
`@mindees/updates` share the 1.0 version line but remain `experimental` (feature-complete + tested; surface
still stabilizing). The genuinely-unbuilt seams — native on-device rendering, TS→native AOT — stay
`research-track` and throw `NotImplementedError`.

## 1.0 accepted API decisions

A pre-1.0 freeze audit surfaced a few judgment calls deliberately **accepted** as-is (not changed), recorded
here so they're conscious, not accidental:

- **`Stack`/`Tabs` (layout/widget) vs `createStackNavigator`/`createTabNavigator` (router navigators)** are
  distinct identifiers on distinct import paths — kept as-is; the navigators are the `@mindees/atlas/stack`
  and `/tab` subpaths.
- **`@mindees/data` CRDT helper naming** (`counterInc`/`orMerge`/`lwwSet`/`vvMerge`) is uneven across the
  four CRDTs but each is internally consistent and the package is `experimental`, so names may still change
  before `@mindees/data` goes `stable`.
- **`@mindees/ai`** uses a positional `(backend, request, schema?, options?)` shape across its operations —
  intentional and consistent.
- **`createScheduler()`** is the recommended constructor; the `Scheduler` class is also exported for
  `instanceof`/typing.
- **`compileToNative`** is a `research-track` stub (throws `NotImplementedError`); its signature is not a
  stability commitment.
- The list utilities **`computeWindow`/`flattenSections`** (and `ListWindow`/`Entry`) on `@mindees/atlas/list`
  are intentionally public, pure, exhaustively-tested helpers for building custom virtualization.

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
