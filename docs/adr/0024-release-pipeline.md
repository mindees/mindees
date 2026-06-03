# ADR-0024: Release pipeline & version-source sync (Phase 13)

- **Status:** Accepted
- **Date:** 2026-06-04

## Context

Phases 0–12 built the framework; Phase 13 makes it releasable. Two release blockers stood out:
the `VERSION='0.0.0'` constant hardcoded in every package's source (it would diverge from
`package.json` at the first Changesets bump, and `@mindees/cli` pins it into scaffolded apps, so
apps would depend on a non-existent version), and an unguarded `release` script that could
publish `0.0.0`. Publishing itself is irreversible and must stay a deliberate, maintainer-gated
decision.

## Decision

### Version-source sync (`scripts/sync-versions.mjs`)

Each package keeps exporting `VERSION` from source (runtime metadata, no package.json read on the
device path). A small Node script rewrites that literal from each `package.json` version, wired
into `version-packages` (`changeset version && node scripts/sync-versions.mjs`) so the
automated **version PR** updates source constants *and* the versions `create-mindees` pins —
atomically with the package.json bumps. Modes: default (rewrite), `--check` (CI guard, fails on
drift), `--assert-released` (publish guard, fails on any `0.0.0`). Private workspace packages
(examples) are skipped.

### CI drift guard

CI runs `pnpm check:versions`, so a source `VERSION` can never silently drift from its
`package.json` on `main`.

### Guarded, maintainer-gated publish

`release` is now `sync-versions --check --assert-released && build && changeset publish` — it
refuses to publish `0.0.0` or with drifted sources. The Release workflow still **only** opens the
version PR; it does **not** publish. The first real publish is run deliberately by a maintainer
(`pnpm release` with npm auth), documented in [RELEASING.md](../../RELEASING.md). Automating it
later is a one-line `publish:` input + OIDC/`NPM_TOKEN`.

## Consequences

- The version line stays consistent across `package.json`, source `VERSION`, and scaffolded apps;
  CI catches drift; the publish path can't ship `0.0.0`.
- No behavior change for consumers yet (still `0.0.0` until the first version PR merges).
- Publishing remains an explicit human decision — by design, not omission.

## Alternatives considered

- **Read `package.json` at runtime for `VERSION`** — rejected: the device path is
  platform-neutral/bundled; a synced source literal is simpler and dependency-free.
- **Auto-publish on version-PR merge** — deferred: the first publish must be a confirmed,
  deliberate action; the workflow is one input away from it when the maintainer is ready.
