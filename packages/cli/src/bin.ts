#!/usr/bin/env node

/**
 * The `mindees` executable — a thin adapter that wires real Node capabilities
 * (filesystem, environment probe, stdout/stderr, AI backend) into the tested
 * {@link runCliAsync} core. All logic lives in the core; this file only does I/O wiring.
 *
 * @module
 */

import {
  existsSync,
  watch as fsWatch,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, relative, sep } from 'node:path'
import process from 'node:process'
import type { AiBackend } from '@mindees/ai'
import { type AdapterName, createServerBackend, type FetchLike } from '@mindees/ai/server'
import { detectImageSupport, itermImage, renderBanner } from './banner'
import { type CliContext, runCliAsync } from './cli'
import { startDev } from './dev'
import { createDevServer, createNodeWatcher, renderDevPage } from './dev-server'
import type { FileSystem } from './fs'
import { VERSION } from './index'
import type { EnvProbe, OutputLine } from './types'

/** A `node:fs`-backed {@link FileSystem}. */
function nodeFileSystem(): FileSystem {
  return {
    exists: (path) => existsSync(path),
    readFile: (path) => readFileSync(path, 'utf8'),
    writeFile: (path, contents) => {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, contents, 'utf8')
    },
    mkdir: (path) => {
      mkdirSync(path, { recursive: true })
    },
    readDir: (dir) => {
      const walk = (current: string, acc: string[]): string[] => {
        if (!existsSync(current)) return acc
        for (const entry of readdirSync(current)) {
          const full = join(current, entry)
          if (statSync(full).isDirectory()) walk(full, acc)
          else acc.push(relative(dir, full).split(sep).join('/'))
        }
        return acc
      }
      return walk(dir, []).sort()
    },
  }
}

/** Probe the real environment for `doctor`/`info`. */
function probeEnv(cwd: string): EnvProbe {
  const pmSpec = process.env.npm_config_user_agent ?? ''
  // user agent looks like "pnpm/11.5.0 npm/? node/v24 ...".
  const pmMatch = pmSpec.match(/^(\w+)\/(\S+)/)
  return {
    nodeVersion: process.version,
    packageManager: pmMatch?.[1] && pmMatch[2] ? { name: pmMatch[1], version: pmMatch[2] } : null,
    hasPackageJson: existsSync(join(cwd, 'package.json')),
    hasNodeModules: existsSync(join(cwd, 'node_modules')),
  }
}

/** Build a server AI backend from `MINDEES_AI_*` env, or `undefined` if not configured. */
function aiBackendFromEnv(): AiBackend | undefined {
  const baseUrl = process.env.MINDEES_AI_BASE_URL
  const model = process.env.MINDEES_AI_MODEL
  if (!baseUrl || !model) return undefined
  // Fail loud on a mistyped adapter rather than silently defaulting to openai (which would
  // build the wrong auth headers and yield confusing HTTP errors). Empty/unset → openai.
  const adapterEnv = process.env.MINDEES_AI_ADAPTER
  if (adapterEnv && adapterEnv !== 'openai' && adapterEnv !== 'anthropic') {
    process.stderr.write(
      `mindees: unknown MINDEES_AI_ADAPTER "${adapterEnv}" (expected "openai" or "anthropic"); AI backend not configured.\n`,
    )
    return undefined
  }
  const adapter: AdapterName = adapterEnv === 'anthropic' ? 'anthropic' : 'openai'
  return createServerBackend({
    // The global `fetch` is structurally compatible at runtime; the minimal FetchLike
    // intentionally avoids the DOM lib, so cast rather than pull in those types.
    fetch: globalThis.fetch as unknown as FetchLike,
    baseUrl,
    model,
    adapter,
    ...(process.env.MINDEES_AI_API_KEY ? { apiKey: process.env.MINDEES_AI_API_KEY } : {}),
  })
}

/**
 * `mindees dev` — the long-running transport over the tested {@link startDev} orchestrator:
 * build + watch `src/`, serve a live-reload preview, and reload the browser on each rebuild. This
 * is the I/O glue; the watcher, server, and orchestrator it wires are unit-tested in their modules.
 */
function runDevServer(ctx: CliContext): void {
  const port = Number(process.env.MINDEES_DEV_PORT ?? 3000) || 3000
  const server = createDevServer()
  // Collect the freshly-built `dist/` tree (recursive, POSIX-relative) to serve as the app.
  const collectDist = (dir = 'dist'): Record<string, string> => {
    if (!ctx.fs.exists(dir)) return {}
    const out: Record<string, string> = {}
    for (const rel of ctx.fs.readDir(dir)) out[rel] = ctx.fs.readFile(`${dir}/${rel}`)
    return out
  }
  const watcher = createNodeWatcher(['src'], {
    watch: (path, opts, listener) =>
      fsWatch(path, { recursive: opts.recursive ?? false }, (event, filename) =>
        listener(event, typeof filename === 'string' ? filename : null),
      ),
  })
  startDev(ctx.fs, watcher, {
    onRebuild: (result) => {
      // Serve the built app on success; show the diagnostics overlay (at `/`) on failure.
      if (result.ok) server.setFiles(collectDist())
      else server.setError(renderDevPage(result))
      server.bump()
      ctx.write({
        text: result.ok
          ? `rebuilt: ${result.compiled.length} file(s) ok`
          : `rebuild failed: ${result.diagnostics.filter((d) => d.severity === 'error').length} error(s)`,
        stream: result.ok ? 'out' : 'err',
      })
    },
  })
  createServer((req, res) => {
    const out = server.handle(req.method ?? 'GET', req.url ?? '/')
    res.writeHead(out.status, out.headers)
    res.end(out.body)
  }).listen(port, () => {
    ctx.write({
      text: `mindees dev — serving http://localhost:${port} (live reload on)`,
      stream: 'out',
    })
  })
}

/**
 * Build the welcome banner for an interactive (TTY) session: the ANSI wordmark always, plus the
 * actual logo PNG inline on image-capable terminals (iTerm2 / WezTerm). Returns `undefined` when
 * stdout is piped (scripts get clean, parseable output).
 */
function buildBanner(): string | undefined {
  if (!process.stdout.isTTY) return undefined
  const color = !process.env.NO_COLOR
  let image: string | null = null
  if (detectImageSupport(process.env)) {
    try {
      const bytes = readFileSync(new URL('../assets/logo.png', import.meta.url))
      image = itermImage(bytes.toString('base64'), { width: 14 })
    } catch {
      image = null // asset missing → wordmark only
    }
  }
  return renderBanner({ color, image, version: VERSION })
}

async function main(): Promise<void> {
  const cwd = process.cwd()
  const write = (line: OutputLine): void => {
    const stream = line.stream === 'err' ? process.stderr : process.stdout
    stream.write(`${line.text}\n`)
  }
  const backend = aiBackendFromEnv()
  const banner = buildBanner()
  const ctx: CliContext = {
    fs: nodeFileSystem(),
    env: probeEnv(cwd),
    cwd,
    version: VERSION,
    write,
    ...(backend ? { aiBackend: backend } : {}),
    ...(banner ? { banner } : {}),
  }
  // `dev` is a long-running transport (not a one-shot command), so it's wired here in the I/O entry
  // rather than the synchronous CLI dispatch. Everything else goes through the tested core.
  if (process.argv[2] === 'dev') {
    runDevServer(ctx)
    return
  }
  const { exitCode } = await runCliAsync(process.argv.slice(2), ctx)
  process.exitCode = exitCode
}

main()
