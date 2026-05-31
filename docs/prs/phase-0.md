# PR: Phase 0 — Repository, governance & toolchain foundation

> This file is the prepared PR title + description for Phase 0, per the project's
> execution guardrails. It is used verbatim to open the PR
> (`phase/0-foundations` → `main`).

## Title

```
feat: Phase 0 — repository, governance & toolchain foundation
```

## Description

Establishes the MindeesNative monorepo: a green-CI skeleton plus the complete
open-source contributor surface. **No framework functionality yet** — by design,
every package is an honest scaffold (see the Working-Code Doctrine).

### What's included

**Toolchain (all versions verified-current on 2026-05-31; see [ADR-0001](../adr/0001-toolchain-selection.md)):**
- pnpm 11 workspaces + Turborepo `2.9.16` (`tasks` graph)
- TypeScript `6.0.3` (strict typecheck) + tsdown `0.22.1` (ESM + `.d.ts` emit)
- Biome `2.4.16` (lint + format), Vitest `4.1.7` (+ v8 coverage)
- Changesets `2.31.0` (single locked version line — [RFC-0001](../../rfcs/0001-monorepo-toolchain-and-version-line.md))
- lefthook `2.1.9` + commitlint `21` (Conventional Commits), expect-type `1.3.0`
- GitHub Actions CI (`checkout`/`setup-node`/`pnpm-action-setup` @v6; Node 22 + 24 matrix)

**Packages (10, all `🚧 scaffold`):** `@mindees/{core,compiler,cli,router,renderer,ai,data,updates,ui}` + `create-mindees`.
Each exports **only** package metadata (`name`, `VERSION`, `maturity`, `info`),
the shared `Maturity`/`PackageInfo` types, and the `NotImplementedError` /
`notImplemented` utilities from `@mindees/core`. No speculative API names.

**Open source surface:** dual `MIT OR Apache-2.0` license, Code of Conduct,
`SECURITY.md`, `GOVERNANCE.md`, `MAINTAINERS.md`, `CONTRIBUTING.md` (DCO),
issue/PR templates, `CODEOWNERS`, the RFC process (+ RFC-0001), ADR process
(+ ADR-0001), `STATUS.md`, `ROADMAP.md`.

### Verification

```
pnpm verify   # lint + typecheck + build + test
```

- Biome lint: clean
- tsc strict typecheck: 10/10 packages
- tsdown build: 10/10 packages
- Vitest: 21/21 tests across 10 packages
- Git hooks: lefthook wires `commit-msg` (commitlint) + `pre-commit` (biome)

### Research track / not included (honest)

Nothing in this PR is a lying stub. No native/iOS/Android, no GPU canvas, no
TS→native AOT, no runtime — those begin in later phases (see
[ROADMAP.md](../../ROADMAP.md)) and are tracked in [STATUS.md](../../STATUS.md).

### How to run

```bash
corepack enable
pnpm install
pnpm verify
```

### Checklist

- [x] `pnpm verify` passes locally
- [x] Tests included (smoke test per package)
- [x] Public symbols have TSDoc
- [x] Conventional Commits + DCO sign-off
- [x] Docs/STATUS reflect reality
- [ ] Changeset: N/A (initial scaffold; first release cut in Phase 12)
