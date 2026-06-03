# ADR-0021: Synapse (Phase 11D) — dev-time error explainer

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

11A–11C shipped the AI contract, backends, structured output, and tool calling. 11D adds the
spec's **dev-time intelligence**: an error explainer that turns a thrown error into an
actionable, structured explanation. It must be honest about being a **toolchain** feature
(not something you bundle into a running app), reuse the existing contract (no new model
plumbing), and be testable offline.

## Decision

### `explainError` on the `@mindees/ai/devtools` subpath

`explainError(backend, error, options?)` normalizes an `Error` (or `{ message, stack?, code? }`)
into a prompt and returns a validated `ErrorExplanation` (`{ summary, likelyCauses[],
suggestedFixes[] }`) via {@link generateObject} — so it inherits the whole structured-output
pipeline (extract → sanitize → validate → bounded repair) and runs against **any** backend: the
deterministic mock in tests, a server backend in a CLI. `formatExplanation` renders it for a
terminal. Lives on the **`./devtools` subpath** to signal intent: this is for your toolchain,
kept out of the device `.` entry.

### `mindees ai explain <error>` CLI command

A thin command in `@mindees/cli`: `runAiCommand` (async, since it calls a model) runs
`explainError` over an **injected** backend and prints `formatExplanation`. As with every CLI
command it's a pure function of injected capabilities, so it's deterministically testable with
the mock. The sync `runCli` is unchanged; a new `runCliAsync` wrapper routes `ai` to the async
handler and delegates every synchronous command to `runCli` (so existing commands and their
tests stay synchronous). The real `bin` builds a server backend from `MINDEES_AI_BASE_URL` /
`MINDEES_AI_MODEL` / `MINDEES_AI_API_KEY` / `MINDEES_AI_ADAPTER`; with none set, the command
prints a clear "configure these env vars" message and exits non-zero (never a stub that
pretends to work).

### Test resolution

`@mindees/cli` gains a `workspace:*` dependency on `@mindees/ai` and imports the explainer from
`@mindees/ai/devtools`. The shared `vitest.config.ts` alias gained a **subpath** rule
(`@mindees/<pkg>/<sub>` → `packages/<pkg>/src/<sub>.ts`) so cross-package subpath imports
resolve to source in tests (previously only bare-package imports did).

## Consequences

- A working, honest dev-time explainer reusing 11C; zero new runtime deps (`@mindees/core`
  only for `@mindees/ai`; the CLI adds the workspace `@mindees/ai` dep).
- The global `fetch` is cast to the minimal `FetchLike` in `bin` (the structural type
  intentionally avoids the DOM lib; the global is runtime-compatible).
- Phase 11 (Synapse) is complete. On-device inference remains a labeled 🔬 research track
  (`createOnDeviceBackend` throws); the working mock/server backends are the real path.

## Alternatives considered

- **Make `runCli` async** — rejected: it would ripple a `Promise` return type through every
  existing (synchronous) command and its tests. A focused `runCliAsync` wrapper is minimal and
  backward-compatible.
- **Export the explainer from the main `.` entry** — rejected: the subpath keeps the device
  entry lean and documents that this is a build/dev tool, mirroring `./server`.
- **A bespoke explanation prompt + ad-hoc JSON parse** — rejected: reusing `generateObject`
  gives the sanitize/validate/repair guarantees for free and stays validator-agnostic.
