#!/usr/bin/env node
/**
 * The `mindees` executable — a thin adapter that wires real Node capabilities
 * (filesystem, environment probe, stdout/stderr) into the tested {@link runCli}
 * core. All logic lives in the core; this file only does I/O wiring.
 *
 * @module
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import process from 'node:process'
import { type CliContext, runCli } from './cli'
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

function main(): void {
  const cwd = process.cwd()
  const write = (line: OutputLine): void => {
    const stream = line.stream === 'err' ? process.stderr : process.stdout
    stream.write(`${line.text}\n`)
  }
  const ctx: CliContext = {
    fs: nodeFileSystem(),
    env: probeEnv(cwd),
    cwd,
    version: VERSION,
    write,
  }
  const { exitCode } = runCli(process.argv.slice(2), ctx)
  process.exitCode = exitCode
}

main()
