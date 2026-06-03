# Phase 1: Deep Audit and Technical Roadmap

## Summary

Canonical repository audited: `https://github.com/mindees/mindees`

Working fork and branch: `https://github.com/aashirathar32/mindees/tree/phase-1-audit-roadmap`

Local checkout: `E:\MiND\mindees`

Branch: `phase-1-audit-roadmap`

Source of truth: `C:\Users\MiND\Downloads\MindeesNative_Framework_Spec(5).md`

Baseline commit audited: `74bec3f36971adbd3acb3b2556d1fd85091750e3`

Final local verification base: rebased onto `upstream/main` at `fc155a6429b2b9466040348304f710325121b66c`

MindeesNative is already a substantial TypeScript monorepo, not an empty scaffold. It has 10 packages, 3 examples, 23 ADRs, pinned tooling, Changesets, Biome, Vitest, Turbo, native host CI workflows, and a conservative public maturity story. The main audit result is positive: the core TypeScript workspace installs, builds, typechecks, tests, exports, and example server smoke tests pass locally after working around a Windows Corepack shim limitation.

The main risks are documentation drift around completed phases, CLI/scaffolder Windows path handling, local developer experience around pnpm/Corepack detection, and noisy build/lint warnings that should be cleaned before wider adoption.

## Repository Inventory

| Area | Result |
| --- | --- |
| Root tooling | pnpm 11.5.0, Node >=22.18, Turbo 2.9.16, TypeScript 6.0.3, Biome 2.4.16, Vitest 4.1.7, tsdown 0.22.1 |
| Workspace layout | `packages/*`, `examples/*` |
| Public packages | `@mindees/core`, `@mindees/compiler`, `@mindees/cli`, `@mindees/router`, `@mindees/renderer`, `@mindees/atlas`, `@mindees/ai`, `@mindees/data`, `@mindees/updates`, `create-mindees` |
| Examples | `examples/pulse-server`, `examples/data-sync-server`, `examples/native-hosts` |
| Governance/docs | License, contributing, security, governance, maintainers, code of conduct, RFCs, ADRs, PR docs |
| CI | Main Node CI, native Android, native iOS, release/version PR workflow |
| Release setup | Changesets fixed version line, public package publish config, release workflow currently version-PR only |

Package source/test/dependency snapshot:

| Package | Prod TS files | Test files | Runtime deps | Dev deps |
| --- | ---: | ---: | ---: | ---: |
| `@mindees/ai` | 13 | 8 | 1 | 0 |
| `@mindees/atlas` | 7 | 5 | 1 | 2 |
| `@mindees/cli` | 13 | 8 | 3 | 0 |
| `@mindees/compiler` | 7 | 6 | 2 | 0 |
| `@mindees/core` | 12 | 16 | 0 | 0 |
| `create-mindees` | 2 | 2 | 2 | 0 |
| `@mindees/data` | 10 | 9 | 1 | 1 |
| `@mindees/renderer` | 10 | 8 | 1 | 1 |
| `@mindees/router` | 9 | 12 | 1 | 4 |
| `@mindees/updates` | 10 | 9 | 3 | 1 |

## Verified Commands

Environment:

| Command | Result |
| --- | --- |
| `node --version` | `v24.15.0` |
| `npm --version` | `11.16.0` |
| `corepack pnpm --version` | `11.5.0` |
| `npm exec --yes --package=pnpm@11.5.0 -- pnpm --version` | `11.5.0` |
| `git config user.name` | `aashirathar32` |
| `git config user.email` | `289659339+aashirathar32@users.noreply.github.com` |

Setup and verification:

| Command | Result |
| --- | --- |
| `corepack pnpm install --frozen-lockfile` | Exit 0. Installed 276 packages across 13 workspace projects. Warning: could not create `mindees` bin link before `@mindees/cli/dist/bin.js` existed. |
| `corepack pnpm run lint` | Exit 0. Biome checked 220 files; reported 2 warnings and 1 info. |
| `corepack pnpm run typecheck` | Exit 1 due local toolchain issue: Turbo could not find a package-manager binary when only `corepack pnpm` was available. |
| `corepack enable` | Exit 1: `EPERM` writing shims under `C:\Program Files\nodejs\pnpx`. |
| `npm exec --yes --package=pnpm@11.5.0 -- pnpm run typecheck` | Exit 0. Turbo ran 17 successful tasks. |
| `npm exec --yes --package=pnpm@11.5.0 -- pnpm run build` | Exit 0. Turbo ran 10 successful build tasks. |
| `npm exec --yes --package=pnpm@11.5.0 -- pnpm run test` | Exit 0. Vitest: 79 files passed, 729 tests passed. |
| `npm exec --yes --package=pnpm@11.5.0 -- pnpm run verify` | Exit 0. Lint + typecheck + build + test completed. |
| `npm exec --yes --package=pnpm@11.5.0 -- pnpm audit --audit-level moderate` | Exit 0. No known vulnerabilities found. |

Post-rebase verification:

| Command/check | Result |
| --- | --- |
| `git rebase origin/main` | Exit 0. Replayed the audit commit on `fc155a6429b2b9466040348304f710325121b66c`; `origin/main` and `upstream/main` both pointed to this commit at final verification time. |
| `npm exec --yes --package=pnpm@11.5.0 -- pnpm run verify` | Exit 0. Biome checked 222 files with 2 warnings and 1 info; typecheck and build passed; Vitest reported 80 files passed and 736 tests passed. |

Notes:

- `npm exec` emits `npm warn Unknown project config "network-concurrency"` because `.npmrc` contains pnpm-specific settings. This does not affect normal pnpm usage but matters for the Corepack fallback path.
- The Node CI workflow should be able to use real `pnpm` via `pnpm/action-setup`, so the local `corepack pnpm` failure is a Windows developer environment issue, not a repo CI failure.

## Export and Example Validation

Package self-export smoke test after build:

| Specifier | Result |
| --- | --- |
| `@mindees/core` | Pass, 29 exports |
| `@mindees/compiler` | Pass, 16 exports |
| `@mindees/renderer` | Pass, 24 exports |
| `@mindees/router` | Pass, 23 exports |
| `@mindees/updates` | Pass, 26 exports |
| `@mindees/updates/server` | Pass, 2 exports |
| `@mindees/updates/sdui` | Pass, 4 exports |
| `@mindees/data` | Pass, 34 exports |
| `@mindees/data/server` | Pass, 2 exports |
| `@mindees/ai` | Pass, 21 exports |
| `@mindees/ai/server` | Pass, 5 exports |
| `@mindees/ai/devtools` | Pass, 2 exports |
| `@mindees/atlas` | Pass, 22 exports |
| `@mindees/atlas/theme` | Pass, 3 exports |
| `@mindees/atlas/list` | Pass, 3 exports |
| `@mindees/cli` | Pass, 22 exports |
| `create-mindees` | Pass, 8 exports |

CLI smoke tests:

| Command | Result |
| --- | --- |
| `node packages\cli\dist\bin.js --help` | Exit 0; prints command list. |
| `node packages\cli\dist\bin.js info` | Exit 0; reports CLI 0.0.0, Node v24.15.0, package manager none. |
| `node packages\cli\dist\bin.js doctor` | Exit 0; warns package manager none and recommends `corepack enable`. |
| `node packages\create-mindees\dist\bin.js --help` | Exit 1; prints usage. |
| `node packages\cli\dist\bin.js create mindees-create-name-smoke --template counter --force` | Exit 0; creates 6 files; generated `package.json` parses for simple app names. |
| `node packages\cli\dist\bin.js create E:\MiND\mindees-create-smoke --template counter --force` | Exit 1 on Windows absolute path handling. |
| `node packages\cli\dist\bin.js create ..\mindees-create-smoke --template counter --force` | Exit 0 but generated invalid JSON because package name became `"..\mindees-create-smoke"`. |

Example server smoke tests:

| Example | Result |
| --- | --- |
| `examples/data-sync-server` | Exit 0 smoke. `GET /sync/pull` returned `{"ops":[],"cursor":0}`; `POST /sync/push` with `[]` returned `{"acked":[]}`. |
| `examples/pulse-server` | Exit 0 smoke. `GET /api/updates?runtimeVersion=1.0.0&currentVersion=1` returned an update response; `currentVersion=2` returned `{"type":"no-update"}`. |

Native host local validation:

| Check | Result |
| --- | --- |
| `java -version` | Java 8 only: `1.8.0_491`. Android workflow requires JDK 17. |
| `gradle --version` | Not available locally. |
| `ANDROID_HOME` / `ANDROID_SDK_ROOT` | Not set locally. |
| `swift --version` | Not available locally. |
| `xcodebuild -version` | Not available on Windows. |

Native Android/iOS host verification is therefore CI-only from this Windows machine. The repo has dedicated native workflows: `.github/workflows/native-android.yml` and `.github/workflows/native-ios.yml`. They are path-filtered and will not run for this docs-only PR unless native files or workflows change.

## Findings

### Critical

No critical production-code blocker was found in Phase 1. The main workspace verification passes after the local pnpm shim workaround.

### High

1. CLI scaffolding mishandles Windows path targets.

   Evidence:

   - Absolute target `E:\MiND\mindees-create-smoke` failed by trying to create `E:\MiND\mindees\E:\MiND\mindees-create-smoke`.
   - Relative path target `..\mindees-create-smoke` generated invalid JSON with package name `"..\mindees-create-smoke"`.
   - `JSON.parse` failed with `Bad escaped character in JSON at position 16`.

   Impact: Windows developers can easily generate broken projects when using paths instead of a simple app name. This is especially important because the product goal emphasizes ordinary-human developer experience.

   Recommended phase: Phase 3, with tests in Phase 4. The CLI should separate target path from package name, use `path.isAbsolute`, normalize target paths safely, and derive a valid npm package name from `basename(target)`.

2. Documentation maturity claims are internally inconsistent.

   Evidence:

   - `STATUS.md` top section says Phase 10E/10F reference sync server and persistence are complete.
   - `STATUS.md` later still says reference sync server/native persistence are follow-ups or research tracks.
   - `packages/data/README.md` says 10E/10F are research tracks, but `packages/data/src/server.ts`, `packages/data/src/persist.ts`, tests, and `examples/data-sync-server` prove the reference server and memory persistence exist.
   - `README.md` FAQ still says real native hosts and Atlas UI are upcoming, while the roadmap/status say native host render verification and Atlas are complete.
   - `packages/renderer/README.md` still says a real iOS/Android host that renders the command stream is a research track, while `examples/native-hosts` and `STATUS.md` describe Phase 8E as complete.

   Impact: The repo's strongest value is honesty about what works. Stale docs weaken trust and blur the boundary between implemented capability and research track.

   Recommended phase: Phase 5, with a docs consistency pass after Phase 2/3 fixes.

3. Local pnpm/Corepack path is fragile on Windows.

   Evidence:

   - Plain `pnpm` was not on PATH.
   - `corepack pnpm run typecheck` failed because Turbo could not find a package-manager binary.
   - `corepack enable` failed with `EPERM` writing to `C:\Program Files\nodejs\pnpx`.
   - `mindees doctor` detected no package manager and recommended `corepack enable`, which was not sufficient in this environment.

   Impact: New Windows contributors can hit setup friction even when Node and Corepack are present. This conflicts with the spec's "100% easy" developer-experience ambition.

   Recommended phase: Phase 2 for documented setup fallback and Phase 3 for improving `doctor` guidance.

### Medium

1. Build succeeds but emits unresolved Node built-in warnings for CLI binaries.

   Evidence:

   - `@mindees/cli` and `create-mindees` builds warn that `node:fs`, `node:path`, `node:process`, and `node:util` could not be resolved under tsdown `platform: 'neutral'`; they are treated as externals.

   Impact: Build output looks suspicious even when correct. This creates review noise and could hide real unresolved imports later.

   Recommended phase: Phase 2. Consider explicit externals/platform settings or split library and bin build configs.

2. Biome exits 0 but reports warnings/info.

   Evidence:

   - `packages/cli/src/cli.ts`: template literal style warning.
   - `packages/compiler/src/flatten.test.ts`: unused suppression comment.
   - `packages/core/src/threading/thread-pool.test.ts`: comma operator warning around test-only indirect eval.

   Impact: The repo's `lint` command is technically green, but warning noise lowers signal in CI and local verification.

   Recommended phase: Phase 2 or Phase 3 depending on whether the fixes are pure style/test cleanup.

3. Fresh install emits a pre-build bin-link warning.

   Evidence:

   - `pnpm install --frozen-lockfile` warns it cannot create a `mindees` bin link because `@mindees/cli/dist/bin.js` does not exist before build.

   Impact: Fresh contributors see a warning during the first command. It is explainable in a source checkout, but it makes setup feel less clean.

   Recommended phase: Phase 2. Options include documenting the warning, adjusting workspace package bin-link expectations, or ensuring build artifacts are available before bin linking where appropriate.

4. Root-level package import smoke tests fail because the private root does not depend on workspace packages.

   Evidence:

   - `import('@mindees/core')` from repo root fails with "Cannot find package '@mindees/core'".
   - The same package self-imports pass from each package directory after build.

   Impact: README snippets are correct for consumers, but not directly runnable from the private root without a package context. This is acceptable but should be considered when adding examples, docs tests, or package export validation.

   Recommended phase: Phase 4. Add explicit package/export validation that installs packed tarballs or uses a controlled fixture project.

### Low

1. `create-mindees --help` exits 1 while printing usage.

   Impact: Small CLI polish issue. Help commands normally exit 0.

   Recommended phase: Phase 3.

2. Canonical metadata points to `mindees/mindees`.

   Evidence:

   - README badges, repository metadata, issue/discussion links, and release workflow canonical guard reference `mindees/mindees`.

   Impact: This is correct for the upstream-first workflow because `aashirathar32/mindees` is a fork. It only matters if the fork becomes the public canonical repository.

   Recommended phase: Phase 5 only if the fork becomes the public home.

## Spec Alignment Matrix

| Whitepaper area | Current repo state | Status |
| --- | --- | --- |
| TypeScript-first framework | Strict TS monorepo, TS package APIs, TSX compiler path | Aligned |
| AOT TypeScript to native | `compileToNative` is an honest research-track `NotImplementedError`; working fallback is TS to optimized JS | Honest partial |
| Helix renderer | DOM backend, SSR/hydration, headless backend, native command backend, reference host | Aligned for current phase |
| True native UI | iOS/Android host examples and CI render tests exist, but no end-to-end native app/JS bridge | Partial; Phase 8F remains |
| GPU canvas | Explicit research track, `createCanvasBackend` throws | Honest gap |
| Multi-threading | Scheduler and Web Worker/inline thread pool exist; native thread pool throws | Honest partial |
| Atlas batteries-included UI | Atlas primitives, theme, and list exist with tests; native rendering remains research | Partial |
| Quantum Router | Typed params/search, router state, render integration, data loaders, guards, transitions exist | Aligned for current roadmap |
| Synapse AI | Mock/server backend, streaming, structured output, tool calling, devtools exist; on-device backend throws | Honest partial |
| Continuum data/sync | Collection, HLC, CRDTs, mutation log, sync engine, reference server, memory persistence exist | Mostly aligned; docs drift |
| Pulse OTA | Signed manifests, Ed25519, content-addressed store, atomic rollback, differential delta, reference server, SDUI exist | Aligned for current roadmap |
| Developer experience | CLI, create package, doctor, examples, docs exist; Windows/Corepack/scaffolder issues remain | Needs improvement |
| Production readiness | Tests/build/audit pass; release publish intentionally not wired; docs and DX need cleanup | Pre-alpha, not production-ready |

## Recommended Roadmap

### Phase 2 - Foundation and Project Structure

- Clean toolchain setup for Windows contributors: document `npm exec --package=pnpm@11.5.0 -- pnpm` fallback or add a repo-local setup script that does not require writing shims to Program Files.
- Clean tsdown build warnings for CLI/create binaries by making Node built-ins explicit externals or using a separate Node-targeted bin build config.
- Decide whether fresh-install bin-link warnings are acceptable in source checkouts; document or remove the warning path.
- Remove Biome warning noise where changes are trivial and isolated.
- Add a package/export validation script that can be run from CI without relying on root-level workspace imports.

### Phase 3 - Core Implementation Quality

- Fix CLI/scaffolder path handling on Windows:
  - Accept simple app names, relative paths, and absolute paths.
  - Resolve target directories with `path.resolve`.
  - Derive package name from the final directory basename.
  - Sanitize or reject invalid npm package names with a clear error.
  - Ensure `--help` exits 0.
- Improve `doctor` so it detects Corepack/pnpm more accurately and gives a Windows-safe fallback when `corepack enable` is permission-blocked.
- Review public API docs for research-track symbols to ensure implemented native-command-host capability is not confused with still-unimplemented direct native backend constructors.

### Phase 4 - Testing and Validation

- Add regression tests for the scaffolder bugs found in Phase 1:
  - Windows absolute path.
  - Parent-relative path.
  - package-name sanitization.
  - generated `package.json` parses.
- Add export/package validation tests using either packed tarballs or a fixture app.
- Add CLI smoke tests for built binaries, including `--help`, `doctor`, `info`, and create flows.
- Consider CI coverage for example server smoke tests.
- Keep native host checks in dedicated CI, but document that they are path-filtered and platform-specific.

### Phase 5 - Documentation and Developer Experience

- Reconcile `README.md`, `STATUS.md`, `ROADMAP.md`, `packages/data/README.md`, and `packages/renderer/README.md` so every phase has one consistent maturity story.
- Add a Windows setup/troubleshooting section covering Corepack permissions and package-manager detection.
- Clarify contributor quickstart vs end-user install, since scaffolded apps pin `@mindees/*` to `0.0.0` until packages are published.
- Keep canonical links pointed at `mindees/mindees` unless the fork becomes the public home.

### Phase 6 - Production Readiness

- Add release readiness checks: packed package install smoke, bin execution from packed artifacts, provenance/publish plan, and package size review.
- Decide when to enable actual npm publishing in `.github/workflows/release.yml`.
- Add benchmark/performance evidence for the claims that are already implemented.
- Keep research tracks visibly labeled until full implementations exist: TS-to-native AOT, GPU canvas, native thread pool, on-device AI, and full native app bridge.

## Final Assessment

The repository is in better shape than a typical pre-alpha framework: tests are broad, pure core logic is well covered, research-track APIs generally fail honestly, package exports work after build, and examples can run locally. The highest-value next work is not a rewrite. It is a focused maintainer pass on developer experience, docs consistency, and the CLI path-handling bug found during audit.

Do not start broad refactors in Phase 2. Keep the next PR tightly scoped to foundation/tooling cleanup, then handle CLI correctness with regression tests in Phase 3/4.
