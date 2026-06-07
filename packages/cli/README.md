# @mindees/cli

**Forge** — the `mindees` command-line interface. Scaffold apps, type-check +
build them with the Mindees Compiler, and diagnose your environment. Zero
third-party dependencies (built on `node:util` `parseArgs`).

> **Status: 🧪 Experimental (pre-1.0).** `create` (three templates), `build`,
> `dev` (build + watch + a real **live-reload HTTP server**), `doctor`, `info`,
> and `ai explain` are implemented and tested. The live dev-server HTTP/HMR
> transport works today; it stays a developer-preview layer (long-poll reload,
> not yet module-level HMR). On-device NL→app generation is Phase 10 (Synapse) —
> today `--prompt` maps to a template deterministically (offline keyword mapping).

## Install

```bash
pnpm add -g @mindees/cli   # provides the `mindees` command
# or scaffold without a global install:
npm create mindees@latest
```

## Commands

```bash
mindees create <name-or-path> [--template blank|counter|app] [--prompt "..."] [--force]
mindees build [--out-dir <dir>] [--no-source-map]
mindees dev             # build + watch src/ + live-reload HTTP server (MINDEES_DEV_PORT, default 3000)
mindees doctor          # diagnose Node / package manager / project / deps
mindees info            # CLI + environment info
mindees ai explain <error message...>   # explain an error with AI (needs MINDEES_AI_* env)
mindees help
```

Templates: **`blank`** (one minimal screen), **`counter`** (signals + fine-grained
reactivity), and **`app`** (a polished starter wired to Atlas components, a hook,
and theming — batteries included).

```text
$ mindees create my-app --template counter
Created "my-app" from the counter template (6 files).
Next: cd "my-app" && pnpm install && mindees dev

$ mindees build
Built 3 module(s); flattened 4/9 elements.

$ mindees dev
mindees dev — serving http://localhost:3000 (live reload on)
rebuilt: 3 file(s) ok

$ mindees doctor
✓ Node.js: v24.7.0
✓ Package manager: pnpm 11.5.0
! Dependencies: node_modules missing
    → Install dependencies: `pnpm install` (or `npm exec --yes --package=pnpm@11.5.0 -- pnpm install` if the pnpm shim is unavailable).
```

## Design: a testable core, a thin shell

Every command is a **pure function** of injected capabilities — a `FileSystem`,
an `EnvProbe`, and a `Writer` — so the entire CLI is deterministic in tests. The
`mindees` executable (`bin`) is a thin adapter that wires real `node:fs` /
`process` into `runCli`. Highlights:

- **`scaffold`** — writes a template through the injected FS (templates are
  in-memory; no on-disk fixtures). Refuses a non-empty target without `--force`.
- **`resolveCreateTarget`** — normalizes simple names, relative paths, and
  absolute Windows/POSIX paths into a target directory plus npm-safe package
  name, so path separators never leak into generated `package.json` files.
- **`buildProject`** — compiles `src/**` via `@mindees/compiler` (the type-check
  gate + emit), writing `dist/` and a `routes.manifest.json` when `src/routes/`
  exists. Genuine type errors fail the build; isolation-only diagnostics
  (unresolved cross-module imports, missing ambient JSX types) are reported as
  warnings (full project-graph checking is future work).
- **`runDoctor`** — environment checks with actionable fixes, over an injected
  `EnvProbe`.
- **`startDev`** — the rebuild orchestrator: builds once, rebuilds on each
  `Watcher` change, tracks build count + last result. The watcher and HMR
  transport are injected, so the orchestrator stays deterministic in tests.
- **`createDevServer` / `createNodeWatcher`** — the live-reload transport behind
  `mindees dev`: a pure request handler that serves the app HTML with a tiny
  injected poll-and-reload client plus a `/__mindees/version` endpoint, and a
  debounced `node:fs.watch` adapter (one rebuild per save). The thin `bin` glue
  wires them into a real `http.createServer`; the behavior (debounced change →
  rebuild → version bump → browser reload) is unit-tested.
- **`runAiCommand`** — `mindees ai explain <error>` runs Synapse's `explainError`
  (`@mindees/ai/devtools`) over a backend built from `MINDEES_AI_*` env
  (`openai` or `anthropic` adapter). The backend is injected, so it's
  deterministically testable with a mock.

## Library API

Forge's internals are exported so other tooling (and `create-mindees`) can reuse
them: `runCli` / `runCliAsync`, `scaffold`, `buildProject`, `startDev`,
`createDevServer` / `createNodeWatcher` / `renderDevPage`, `runDoctor`,
`runAiCommand`, `resolveCreateTarget`, `createMemoryFileSystem`, `TEMPLATES` /
`getTemplate` / `materialize`, `naturalLanguageToTemplate`, and their types.

## License

`MIT OR Apache-2.0`
