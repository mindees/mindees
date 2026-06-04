#!/usr/bin/env node

/**
 * Smoke-test the compiled CLI binaries from dist.
 *
 * Unit tests import source directly, so they can pass even when a package's
 * packaged executable is broken. This script runs after `pnpm run build` and
 * executes the same dist entrypoints users invoke through package bins.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const node = process.execPath
const cliBin = join(root, 'packages', 'cli', 'dist', 'bin.js')
const createBin = join(root, 'packages', 'create-mindees', 'dist', 'bin.js')
const commandTimeoutMs = 30_000
const tempRoots = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function excerpt(text) {
  const trimmed = text.trim()
  if (trimmed.length <= 1600) return trimmed
  return `${trimmed.slice(0, 1600)}...`
}

function commandOutput(result) {
  return [
    `exit=${result.status ?? 'null'} signal=${result.signal ?? 'none'}`,
    `stdout:\n${excerpt(result.stdout ?? '') || '(empty)'}`,
    `stderr:\n${excerpt(result.stderr ?? '') || '(empty)'}`,
  ].join('\n')
}

function run(label, args, options = {}) {
  const env = {
    ...process.env,
    npm_config_user_agent:
      process.env.npm_config_user_agent ??
      `pnpm/11.5.0 npm/? node/${process.version.replace(/^v/, '')} ${process.platform} ${process.arch}`,
  }
  const result = spawnSync(node, args, {
    cwd: options.cwd ?? root,
    env,
    encoding: 'utf8',
    timeout: commandTimeoutMs,
    windowsHide: true,
  })
  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      throw new Error(`${label}: timed out after ${commandTimeoutMs}ms\n${commandOutput(result)}`)
    }
    throw new Error(`${label}: failed to launch: ${result.error.message}`)
  }
  return result
}

function expectExit(label, result, code) {
  assert(
    result.status === code,
    `${label}: expected exit ${code}, got ${result.status ?? 'null'}\n${commandOutput(result)}`,
  )
}

function expectIncludes(label, text, needle) {
  assert(text.includes(needle), `${label}: expected output to include ${JSON.stringify(needle)}`)
}

function expectEmpty(label, text) {
  assert(text.length === 0, `${label}: expected empty output, got:\n${excerpt(text)}`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function makeTempRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'mindees-cli-smoke-'))
  tempRoots.push(dir)
  return dir
}

function requireBuiltBins() {
  assert(existsSync(cliBin), `missing ${cliBin}; run pnpm run build before pnpm run smoke:cli`)
  assert(
    existsSync(createBin),
    `missing ${createBin}; run pnpm run build before pnpm run smoke:cli`,
  )
}

function smokeMindeesBin() {
  let result = run('mindees --help', [cliBin, '--help'])
  expectExit('mindees --help', result, 0)
  expectIncludes('mindees --help', result.stdout, 'Usage: mindees')
  expectEmpty('mindees --help stderr', result.stderr)

  result = run('mindees create --help', [cliBin, 'create', '--help'])
  expectExit('mindees create --help', result, 0)
  expectIncludes('mindees create --help', result.stdout, 'Usage: mindees create')
  expectEmpty('mindees create --help stderr', result.stderr)

  result = run('mindees info', [cliBin, 'info'])
  expectExit('mindees info', result, 0)
  expectIncludes('mindees info', result.stdout, 'mindees CLI')

  result = run('mindees doctor', [cliBin, 'doctor'])
  expectExit('mindees doctor', result, 0)
  expectIncludes('mindees doctor', result.stdout, 'Node.js')

  const tempRoot = makeTempRoot()
  result = run('mindees create relative path with spaces', [cliBin, 'create', 'My App!'], {
    cwd: tempRoot,
  })
  expectExit('mindees create relative path with spaces', result, 0)
  expectIncludes('mindees create relative path with spaces', result.stdout, 'Created "my-app"')
  expectIncludes(
    'mindees create relative path with spaces',
    result.stdout,
    "Next: cd 'My App!' && pnpm install && mindees dev",
  )
  const generated = readJson(join(tempRoot, 'My App!', 'package.json'))
  assert(
    generated.name === 'my-app',
    `mindees create generated package name ${JSON.stringify(generated.name)}, expected "my-app"`,
  )

  result = run('mindees create rejects Windows drive root', [cliBin, 'create', 'C:\\'])
  expectExit('mindees create rejects Windows drive root', result, 1)
  expectIncludes(
    'mindees create rejects Windows drive root',
    result.stderr,
    'Could not derive a package name',
  )
}

function smokeCreateMindeesBin() {
  let result = run('create-mindees --help', [createBin, '--help'])
  expectExit('create-mindees --help', result, 0)
  expectIncludes('create-mindees --help', result.stdout, 'Usage: create-mindees')
  expectEmpty('create-mindees --help stderr', result.stderr)

  const tempRoot = makeTempRoot()
  const target = join(tempRoot, 'From Create Mindees!')
  result = run('create-mindees absolute path with spaces', [createBin, target])
  expectExit('create-mindees absolute path with spaces', result, 0)
  expectIncludes(
    'create-mindees absolute path with spaces',
    result.stdout,
    'Created "from-create-mindees"',
  )
  expectIncludes('create-mindees absolute path with spaces', result.stdout, "Next: cd '")
  const generated = readJson(join(target, 'package.json'))
  assert(
    generated.name === 'from-create-mindees',
    `create-mindees generated package name ${JSON.stringify(generated.name)}, expected "from-create-mindees"`,
  )
}

function main() {
  requireBuiltBins()
  smokeMindeesBin()
  smokeCreateMindeesBin()
  process.stdout.write('smoke:cli passed\n')
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`smoke:cli failed: ${message}\n`)
  process.exitCode = 1
} finally {
  for (const dir of tempRoots.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
}
