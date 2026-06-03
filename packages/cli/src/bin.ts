#!/usr/bin/env node

/**
 * The `mindees` executable — a thin adapter that wires real Node capabilities
 * (filesystem, environment probe, stdout/stderr, AI backend) into the tested
 * {@link runCliAsync} core. All logic lives in the core; this file only does I/O wiring.
 *
 * @module
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import process from 'node:process'
import type { AiBackend } from '@mindees/ai'
import { type AdapterName, createServerBackend, type FetchLike } from '@mindees/ai/server'
import { type CliContext, runCliAsync } from './cli'
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
  const adapter: AdapterName =
    process.env.MINDEES_AI_ADAPTER === 'anthropic' ? 'anthropic' : 'openai'
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

async function main(): Promise<void> {
  const cwd = process.cwd()
  const write = (line: OutputLine): void => {
    const stream = line.stream === 'err' ? process.stderr : process.stdout
    stream.write(`${line.text}\n`)
  }
  const backend = aiBackendFromEnv()
  const ctx: CliContext = {
    fs: nodeFileSystem(),
    env: probeEnv(cwd),
    cwd,
    version: VERSION,
    write,
    ...(backend ? { aiBackend: backend } : {}),
  }
  const { exitCode } = await runCliAsync(process.argv.slice(2), ctx)
  process.exitCode = exitCode
}

main()
