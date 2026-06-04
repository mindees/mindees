# Contributing to MindeesNative

First: thank you. MindeesNative is built in the open, and it is built to be
contributed to. This guide gets you from clone to green build in a few minutes,
and explains the one rule that matters most here: **everything we ship actually
works.**

By participating you agree to our [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## Prerequisites

- **Node.js** — current Active LTS (see [`.nvmrc`](./.nvmrc)).
- **pnpm** — managed via Corepack (bundled with Node). You do **not** need to
  install pnpm globally.
- **git**.

## Setup (under 5 commands)

```bash
corepack enable                              # activates the pinned pnpm version
git clone https://github.com/mindees/mindees.git
cd mindees
pnpm install
pnpm verify                                  # lint + versions + typecheck + build + exports + pack + CLI smoke + test
```

If `pnpm verify` is green, you're ready.

### Windows/Corepack fallback

On locked-down Windows installs, `corepack enable` can fail if Node.js is under
`C:\Program Files` and your shell cannot write Corepack shims there. You can
still use the repository-pinned pnpm without installing a global package:

```powershell
npm exec --yes --package=pnpm@11.5.0 -- pnpm install
npm exec --yes --package=pnpm@11.5.0 -- pnpm verify
```

This fallback runs pnpm 11.5.0 from npm's cache for the current command. CI and
ordinary contributor shells should keep using the shorter `pnpm ...` commands
after Corepack has made `pnpm` available on PATH.

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm verify` | Runs the full gate: lint, version sync, typecheck, build, export validation, packed artifact validation, CLI smoke, and tests. |
| `pnpm build` | Builds all packages. |
| `pnpm test` | Runs all tests (Vitest). |
| `pnpm lint` | Lints + checks formatting (Biome). |
| `pnpm format` | Auto-formats the codebase. |
| `pnpm typecheck` | Type-checks all packages under `strict`. |
| `pnpm check:versions` | Verifies every exported source `VERSION` matches its package manifest. |
| `pnpm check:exports` | Verifies built package export/bin targets and imports each public specifier from its owning package directory. |
| `pnpm check:pack` | Packs every public package, validates tarball contents/manifests, installs the tarballs into a fixture, imports every public specifier, runs packed bins, and prints size evidence. |
| `pnpm changeset` | Records a changeset for your change (see Releasing). |

> Exact task wiring lives in `turbo.json` and the root `package.json`.

## Repository layout

```
packages/      # the @mindees/* packages (core, compiler, router, renderer, ...)
create-mindees/# the scaffolder
examples/      # runnable example apps (web target is first-class)
docs/          # documentation, ADRs, and PR descriptions (docs/prs/)
rfcs/          # the public RFC process
registry/      # community module registry (sandboxed module ABI)
```

---

## The Working-Code Doctrine (please read)

This project optimizes for **honest, working software at every step** over
breadth. Concretely:

1. **No lying stubs.** A function whose name implies it does work must actually
   do that work. If a capability isn't built yet, it is either:
   - **(a)** a real, documented **working fallback**, or
   - **(b)** an explicit **research track**: it throws `NotImplementedError`,
     is marked `@experimental` in TSDoc, and is listed as not-working in the
     package README status table and in [`STATUS.md`](./STATUS.md).
2. **Do not export future API names before they exist.** Until a feature's real
   implementation phase, packages export **only** package metadata (`name`,
   `VERSION`, `maturity`, `info`), the `Maturity`/`PackageInfo` status types, and
   the `NotImplementedError` / `notImplemented` utilities — never speculative API
   surface. This keeps our public contract truthful and avoids locking in shapes
   we haven't designed.
3. **Green is the definition of done.** A change is done when `pnpm verify`
   passes locally and in CI.
4. **Tests come with the code.** New behavior ships with tests; bug fixes ship
   with a regression test.
5. **Be honest in docs.** Every "beats RN/Flutter" claim must map to a working
   capability, or be clearly labeled an aspiration/research track.

If a change feels like it forces a violation of the above, that's a signal to
make it smaller, not to weaken the rule.

## Engineering standards

- **TypeScript `strict`**, no shipped `any` (use `unknown` + narrowing).
- ESM-only, with correct `exports` maps and types.
- Public symbols get **TSDoc**. Public generic APIs get **type-level tests**.
- Architectural decisions get an [ADR](./docs/adr/README.md); substantial
  changes get an [RFC](./rfcs/README.md).

---

## Commits

We use **[Conventional Commits](https://www.conventionalcommits.org/)**, enforced
by commitlint on the `commit-msg` hook.

```
<type>(<optional scope>): <description>

feat(router): add typed search-param validation
fix(core): prevent double-notify in diamond dependency
docs(readme): clarify status table
chore(ci): bump setup-node to current major
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`,
`ci`, `chore`.

### Sign your commits (DCO)

Contributions are accepted under the
[Developer Certificate of Origin](https://developercertificate.org/). Add a
`Signed-off-by` line by committing with `-s`:

```bash
git commit -s -m "feat(core): add signal disposal scope"
```

## Pull requests

1. Branch from `main` (e.g. `feat/router-typed-params` or `fix/core-diamond`).
2. Make the change small and focused. One logical change per PR.
3. Run `pnpm verify` — it must be green.
4. Add a changeset: `pnpm changeset`.
5. Fill in the PR template, including:
   - **what shipped**,
   - **what (if anything) is a research track** (and why),
   - **what you researched/verified** (versions, APIs, sources), and
   - **how to run/observe it**.

A maintainer will review. See [GOVERNANCE.md](./GOVERNANCE.md) for how decisions
are made.

## Releasing (maintainers)

We use [Changesets](https://github.com/changesets/changesets). All `@mindees/*`
packages share one locked version line. Flow:

```bash
pnpm changeset            # describe the change + bump type (in your PR)
```

On merge to `main`, the Release workflow opens/updates a **"version packages"
PR** — `pnpm version-packages` applies the bumps + changelogs **and** syncs each
package's source `VERSION` (and the versions `create-mindees` pins) via
`scripts/sync-versions.mjs`. Publishing is **intentionally maintainer-gated and
not automated in CI**: once the version PR is merged (versions are real, not
`0.0.0`), a maintainer runs `pnpm release` with npm auth — it refuses to publish
`0.0.0` or with drifted sources. See [RELEASING.md](./RELEASING.md) for the full
process.

## Good first issues

Look for issues labeled [`good first issue`](https://github.com/mindees/mindees/labels/good%20first%20issue)
and [`help wanted`](https://github.com/mindees/mindees/labels/help%20wanted).
If you're unsure where to start, open a discussion or a draft PR — we're happy
to help you land your first contribution.
