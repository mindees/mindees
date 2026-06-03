# @mindees/cli

**Forge** — the `mindees` command-line interface. Scaffold apps, type-check +
build them with the Mindees Compiler, and diagnose your environment. Zero
third-party dependencies (built on `node:util` `parseArgs`).

> **Status: 🧪 Experimental (Phase 5).** `create`, `build`, `doctor`, `info`,
> and the dev **rebuild orchestrator** are implemented and tested. The live
> dev-server **HTTP/HMR transport** is a developer preview. On-device NL→app
> generation is Phase 10 — today `--prompt` maps to a template deterministically.

## Commands

```bash
mindees create <name-or-path> [--template blank|counter] [--prompt "..."] [--force]
mindees build [--out-dir <dir>] [--no-source-map]
mindees doctor          # diagnose Node / package manager / project / deps
mindees info            # CLI + environment info
mindees dev             # rebuild-on-change (developer preview)
mindees help
```

```text
$ mindees create my-app --template counter
Created "my-app" from the counter template (6 files).
Next: cd my-app && pnpm install && mindees dev

$ mindees build
Built 3 module(s); flattened 4/9 elements.

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
  transport are injected (the live server is the preview layer).

## Library API

Forge's internals are exported so other tooling (and `create-mindees`) can reuse
them: `runCli`, `scaffold`, `buildProject`, `startDev`, `runDoctor`,
`resolveCreateTarget`, `createMemoryFileSystem`, `TEMPLATES`,
`naturalLanguageToTemplate`, and their types.

## License

`MIT OR Apache-2.0`
