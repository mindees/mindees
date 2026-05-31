# ADR-0001: Toolchain selection

- **Status:** Accepted
- **Date:** 2026-05-31

## Context

MindeesNative is an open-source TypeScript monorepo of many small packages that
must be easy to contribute to, fast to build, and trustworthy to publish. We
needed to choose, and pin, a toolchain. Per the project's Research Protocol, the
current stable version and recommended configuration of every tool was verified
against primary sources (npm registry, official docs, GitHub releases) in late
May 2026 before pinning — not assumed from memory.

## Decision

| Concern | Choice | Version (verified 2026-05-31) |
| --- | --- | --- |
| Runtime | Node.js Active LTS ("Krypton") | 24 (floor `>=22.18` to also support Maintenance LTS 22) |
| Package manager | pnpm + Corepack | `pnpm@11.5.0` (pinned via `packageManager`) |
| Task runner | Turborepo | `2.9.16` (uses `tasks`, not the legacy `pipeline`) |
| Language / typecheck | TypeScript | `6.0.3` |
| Library build (ESM + d.ts) | tsdown (Rolldown-powered) | `0.22.1` |
| Lint + format | Biome | `2.4.16` |
| Tests + coverage | Vitest + @vitest/coverage-v8 | `4.1.7` |
| Versioning / release | Changesets | `2.31.0` |
| Git hooks | lefthook | `2.1.9` |
| Commit convention | commitlint + config-conventional | `21.0.2` |
| Type-level tests | expect-type | `1.3.0` |

Key rationale:

- **pnpm** — strict, fast, content-addressed; best workspace story. We pin the
  exact version via `packageManager` so Corepack/CI/contributors are identical.
- **Turborepo over Nx** — lighter and unopinionated; we only need task
  orchestration + caching, not Nx's generators/plugins. Confirmed the 2.x key is
  `tasks` (the old `pipeline` was renamed in 2.0).
- **tsdown over tsup / tsc project references** — one tool emits ESM + `.d.ts`,
  Rolldown-fast, and is the maintained successor to tsup. `tsc` is used only for
  type-checking (`noEmit`); tsdown owns emit, which is why `moduleResolution` is
  `bundler`.
- **Biome over ESLint+Prettier** — a single fast Rust binary for lint + format +
  import sorting; fewer dependencies (aligns with "batteries included,
  dependencies excluded").
- **lefthook over husky** — single declarative config, parallel hooks, native
  staged-file globbing with `stage_fixed`, no companion tools needed.
- **expect-type over tsd** — zero-runtime, validated by our existing `tsc`; it is
  the same engine Vitest uses for `expectTypeOf`, so no extra toolchain.
- **DCO over CLA** — lighter-weight contributor sign-off (`git commit -s`).
- **MIT OR Apache-2.0** dual license — the permissive + explicit-patent-grant
  model used widely in the modern OSS ecosystem.

### Empirically-resolved detail

A research pass suggested pnpm v11 replaced `onlyBuiltDependencies` with an
`allowBuilds` map. We treat the **running pnpm's own behavior** as authoritative:
we configure approved build scripts in `pnpm-workspace.yaml` and reconcile the
key name against what `pnpm approve-builds` writes for the pinned `pnpm@11.5.0`.
This is recorded as a reminder to re-verify on each pnpm minor bump.

## Consequences

- One locked toolchain; reproducible `corepack enable && pnpm install && pnpm verify`.
- `moduleResolution: "bundler"` means `tsc` cannot emit JS — intentional, tsdown
  emits. If we ever drop tsdown we must switch to `nodenext` + `.js` import
  extensions.
- Pinning exact versions (biome, vitest, typescript, turbo, tsdown) trades
  automatic patch updates for reproducibility; Changesets/Dependabot can bump
  them deliberately.
- Node floor is `>=22.18` (tsdown's requirement) so CI can test on both 22 and
  24; `.nvmrc` recommends 24.
