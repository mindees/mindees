/**
 * Forge CLI dispatch — `mindees <command> [args]`.
 *
 * `runCli` is a pure function of (argv, context) → exit code, writing structured
 * output through an injected {@link Writer}. All side-effecting capabilities
 * (filesystem, env probe) are injected via {@link CliContext}, so the entire CLI
 * is deterministically testable; the thin `bin` entrypoint wires real adapters.
 *
 * @module
 */

import { parseArgs } from 'node:util'
import type { AiBackend } from '@mindees/ai'
import { runAiCommand } from './ai'
import { buildProject } from './build'
import { doctorSummary, renderDoctor, runDoctor } from './doctor'
import type { FileSystem } from './fs'
import { naturalLanguageToTemplate } from './nl'
import { scaffold } from './scaffold'
import { DEFAULT_TEMPLATE, templateNames } from './templates'
import type { CommandResult, EnvProbe, Writer } from './types'

/** Everything the CLI needs from the outside world (injected for testability). */
export interface CliContext {
  fs: FileSystem
  env: EnvProbe
  /** Working directory (where `create` writes, what `build` reads). */
  cwd: string
  /** CLI version string (from package metadata). */
  version: string
  /** Output sink. */
  write: Writer
  /** AI backend for `ai` commands (wired from `MINDEES_AI_*` env in `bin`). */
  aiBackend?: AiBackend
}

const HELP = `mindees — the MindeesNative CLI (Forge)

Usage: mindees <command> [options]

Commands:
  create <name>     Scaffold a new app   (--template <name>, --force)
  build             Type-check + compile the project   (--out-dir <dir>)
  dev               Build and rebuild on change (developer preview)
  doctor            Diagnose your environment
  info              Show CLI + environment info
  ai explain <err>  Explain an error with AI   (needs MINDEES_AI_* env)
  help              Show this help

Run \`mindees create --help\` style flags inline. Templates: ${templateNames().join(', ')}.`

function out(write: Writer, text: string): void {
  write({ stream: 'out', text })
}
function err(write: Writer, text: string): void {
  write({ stream: 'err', text })
}

/**
 * Run the CLI. Returns a {@link CommandResult} with the process exit code.
 * Never throws for expected failures — it reports them and returns non-zero.
 */
export function runCli(argv: readonly string[], ctx: CliContext): CommandResult {
  const [command, ...rest] = argv

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    out(ctx.write, HELP)
    return { exitCode: 0 }
  }

  if (command === '--version' || command === '-v' || command === 'version') {
    out(ctx.write, ctx.version)
    return { exitCode: 0 }
  }

  switch (command) {
    case 'create':
      return cmdCreate(rest, ctx)
    case 'build':
      return cmdBuild(rest, ctx)
    case 'dev':
      return cmdDev(ctx)
    case 'doctor':
      return cmdDoctor(ctx)
    case 'info':
      return cmdInfo(ctx)
    default:
      err(ctx.write, `Unknown command "${command}". Run \`mindees help\`.`)
      return { exitCode: 1 }
  }
}

/**
 * The async CLI entry. Handles the model-calling `ai` command (which is asynchronous) and
 * delegates every synchronous command to {@link runCli}. The `bin` calls this; tests can call
 * either (sync commands stay testable through `runCli`).
 */
export function runCliAsync(argv: readonly string[], ctx: CliContext): Promise<CommandResult> {
  const [command, ...rest] = argv
  if (command === 'ai') {
    return runAiCommand(rest, {
      write: ctx.write,
      ...(ctx.aiBackend ? { backend: ctx.aiBackend } : {}),
    })
  }
  return Promise.resolve(runCli(argv, ctx))
}

function cmdCreate(args: readonly string[], ctx: CliContext): CommandResult {
  const { values, positionals } = parseArgs({
    args: [...args],
    allowPositionals: true,
    strict: false,
    options: {
      template: { type: 'string', short: 't' },
      force: { type: 'boolean' },
      prompt: { type: 'string', short: 'p' },
    },
  })

  const name = positionals[0]
  if (!name) {
    err(ctx.write, 'create: missing app name. Usage: mindees create <name> [--template <t>]')
    return { exitCode: 1 }
  }

  // NL → template: `--prompt "a counter app"` picks a template deterministically
  // (offline). Real AI generation arrives with Synapse in Phase 10; until then
  // this is an honest keyword-based mapping that never blocks `create`. An
  // explicit `--template` always wins; the prompt only resolves a template when
  // the caller didn't choose one (mirrors `create-mindees`'s runCreate so both
  // entrypoints agree on precedence).
  const explicitTemplate = typeof values.template === 'string' ? values.template : undefined
  let template = explicitTemplate ?? DEFAULT_TEMPLATE
  if (
    explicitTemplate === undefined &&
    typeof values.prompt === 'string' &&
    values.prompt.length > 0
  ) {
    const picked = naturalLanguageToTemplate(values.prompt)
    template = picked.template
    out(ctx.write, `Interpreted prompt → "${picked.template}" template (${picked.reason}).`)
  }

  const targetDir = ctx.cwd === '.' ? name : `${ctx.cwd}/${name}`
  const result = scaffold(ctx.fs, {
    appName: name,
    targetDir,
    template,
    force: values.force === true,
  })

  if (!result.ok) {
    err(ctx.write, result.error ?? 'create failed')
    return { exitCode: 1 }
  }

  out(
    ctx.write,
    `Created "${name}" from the ${result.template} template (${result.written.length} files).`,
  )
  out(ctx.write, `Next: cd ${name} && pnpm install && mindees dev`)
  return { exitCode: 0 }
}

function cmdBuild(args: readonly string[], ctx: CliContext): CommandResult {
  const { values } = parseArgs({
    args: [...args],
    allowPositionals: true,
    strict: false,
    options: { 'out-dir': { type: 'string' }, 'no-source-map': { type: 'boolean' } },
  })

  const result = buildProject(ctx.fs, {
    root: ctx.cwd,
    outDir: typeof values['out-dir'] === 'string' ? values['out-dir'] : `${ctx.cwd}/dist`,
    sourceMap: values['no-source-map'] !== true,
  })

  for (const d of result.diagnostics) {
    const where = d.file ? `${d.file}${d.position ? `:${d.position.line}` : ''}: ` : ''
    err(ctx.write, `${d.severity} ${d.code} ${where}${d.message}`)
  }

  if (!result.ok) {
    err(ctx.write, 'Build failed: fix the type errors above.')
    return { exitCode: 1 }
  }
  out(
    ctx.write,
    `Built ${result.compiled.length} module(s); flattened ${result.stats.flattenedNodes}/${result.stats.totalElements} elements.`,
  )
  return { exitCode: 0 }
}

function cmdDev(ctx: CliContext): CommandResult {
  // The dev server transport (HTTP + HMR socket) is a developer-preview layer in
  // `bin`. The CLI command here reports how to use it; the tested rebuild
  // orchestrator lives in `dev.ts` (`startDev`).
  out(ctx.write, 'mindees dev — developer preview.')
  out(ctx.write, 'The rebuild-on-change orchestrator is available via startDev(); the')
  out(ctx.write, 'HTTP/HMR transport is being finalized. Use `mindees build` for now.')
  return { exitCode: 0 }
}

function cmdDoctor(ctx: CliContext): CommandResult {
  const checks = runDoctor(ctx.env)
  for (const line of renderDoctor(checks)) out(ctx.write, line)
  const summary = doctorSummary(checks)
  return { exitCode: summary === 'fail' ? 1 : 0 }
}

function cmdInfo(ctx: CliContext): CommandResult {
  out(ctx.write, `mindees CLI ${ctx.version}`)
  out(ctx.write, `Node ${ctx.env.nodeVersion}`)
  out(
    ctx.write,
    `Package manager: ${ctx.env.packageManager ? `${ctx.env.packageManager.name} ${ctx.env.packageManager.version}` : 'none'}`,
  )
  out(ctx.write, `Templates: ${templateNames().join(', ')}`)
  return { exitCode: 0 }
}
