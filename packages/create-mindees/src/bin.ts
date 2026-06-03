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
import type { FileSystem } from '@mindees/cli'
import { parseCreateCommand } from './args'
import { runCreate } from './index'

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
  const command = parseCreateCommand(process.argv.slice(2), process.cwd())
  if (command.kind === 'help') {
    process.stdout.write(`${command.usage}\n`)
    process.exitCode = command.exitCode
    return
  }

  if (command.kind === 'error') {
    process.stderr.write(`${command.error}\n${command.usage}\n`)
    process.exitCode = command.exitCode
    return
  }

  const result = runCreate(nodeFileSystem(), command.args)
  if (!result.ok) {
    process.stderr.write(`${result.error ?? 'create failed'}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(
    `Created "${command.args.appName}" from the ${result.template} template (${result.written.length} files).\n`,
  )
  process.stdout.write(`Next: cd ${command.displayDir} && pnpm install && mindees dev\n`)
}

main()
