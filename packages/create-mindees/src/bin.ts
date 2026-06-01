#!/usr/bin/env node
/**
 * `create-mindees` executable — `npm create mindees@latest <name>`.
 *
 * A thin adapter: parse argv, wire a `node:fs`-backed filesystem, delegate to
 * the tested {@link runCreate}. All logic lives in the core.
 *
 * @module
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import type { FileSystem } from '@mindees/cli'
import { type CreateArgs, runCreate } from './index'

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

function main(): void {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: false,
    options: {
      template: { type: 'string', short: 't' },
      prompt: { type: 'string', short: 'p' },
      force: { type: 'boolean' },
    },
  })

  const appName = positionals[0]
  if (!appName) {
    process.stderr.write('Usage: create-mindees <app-name> [--template <name>] [--prompt "..."]\n')
    process.exitCode = 1
    return
  }

  const args: CreateArgs = {
    appName,
    targetDir: join(process.cwd(), appName),
    force: values.force === true,
  }
  if (typeof values.template === 'string') args.template = values.template
  if (typeof values.prompt === 'string') args.prompt = values.prompt

  const result = runCreate(nodeFileSystem(), args)
  if (!result.ok) {
    process.stderr.write(`${result.error ?? 'create failed'}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(
    `Created "${appName}" from the ${result.template} template (${result.written.length} files).\n`,
  )
  process.stdout.write(`Next: cd ${appName} && pnpm install && mindees dev\n`)
}

main()
