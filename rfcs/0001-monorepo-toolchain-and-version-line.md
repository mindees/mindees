# RFC-0001: Monorepo toolchain & single locked version line

- **Status:** Accepted
- **Author(s):** Mindees Core
- **Created:** 2026-05-31
- **Tracking issue:** (Phase 0)
- **Affected packages:** all `@mindees/*` + `create-mindees`

## Summary

All MindeesNative packages live in one monorepo, share one verified toolchain,
and are released on a **single locked version line** — every package always has
the same version and is published together. This RFC records that decision and
its rationale. (The concrete tool choices are detailed in
[ADR-0001](../docs/adr/0001-toolchain-selection.md).)

## Motivation

A defining pain of the incumbents we aim to improve on is **dependency and
version hell**: in the React Native ecosystem, "your upgrade path is your slowest
dependency," and mismatched versions across many separately-versioned packages
cause silent, hard-to-debug breakage. We want the opposite property: a user
should be able to install any `@mindees/*` package and trust that the rest of the
framework at the same version is compatible, tested together, and upgradeable
atomically.

## Guide-level explanation

- Every `@mindees/*` package and `create-mindees` is versioned and published
  **together at one identical version**. There is never a "core@2.3 with
  router@2.1" combination to reason about.
- Internally, packages depend on each other with the pnpm `workspace:*`
  protocol, which Changesets rewrites to the exact published version on release.
- Releases are produced with Changesets: `pnpm changeset` (record intent),
  `pnpm changeset version` (bump everything in the group + changelogs),
  `pnpm changeset publish` (publish).

## Reference-level explanation

- **Changesets `fixed` group**, not `linked`. `fixed` means: if *any* package in
  the group has a changeset, *every* package is bumped and published at the same
  new version — guaranteeing the version line never drifts. `linked` only shares
  a high-water number and does **not** republish untouched packages, so versions
  diverge over time. Config (`.changeset/config.json`):

  ```json
  "fixed": [["@mindees/*", "create-mindees"]]
  ```

- **One toolchain**, pinned and verified (ADR-0001): pnpm + Turborepo +
  TypeScript 6 (typecheck) + tsdown (emit) + Biome + Vitest + Changesets +
  lefthook/commitlint.
- **Atomic upgrades**: because everything moves together, an upgrade is one
  version bump for the whole platform, with codemods (deferred under Phase 13) to
  migrate breaking changes mechanically.

## Drawbacks

- A package with no functional change still gets a version bump when a sibling
  changes. This is an accepted cost: it buys a guarantee that any same-version
  combination is tested together. Disk/registry cost is negligible.

## Rationale and alternatives

- **Independent versioning (rejected):** maximum flexibility, but reintroduces
  exactly the version-matrix problem we are trying to eliminate.
- **`linked` instead of `fixed` (rejected):** lets versions drift; breaks the
  "any same-version combination is compatible" guarantee.

## Prior art

- Rust's `MIT OR Apache-2.0` dual-license convention (adopted here).
- Babel and Jest historically used lockstep/fixed versioning across their
  package families for exactly this compatibility guarantee.

## Unresolved questions

- The LTS policy and codemod tooling for breaking upgrades are deferred under
  Phase 13.

## Future possibilities

- Automated migration codemods bound to each breaking version.
- A meta package that pins the whole platform at once.
