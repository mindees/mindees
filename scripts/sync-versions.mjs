#!/usr/bin/env node
/**
 * Sync each package's source `VERSION` constant to its package.json version.
 *
 * Every `@mindees/*` package (and `create-mindees`) exports `VERSION` from source for runtime
 * metadata, and `@mindees/cli` pins it into the apps it scaffolds. Changesets bumps
 * package.json but not the source literal, so without this they drift (and scaffolded apps
 * would depend on a non-existent version). `version-packages` runs this right after
 * `changeset version`; CI runs it with `--check` to fail on drift.
 *
 * Usage:
 *   node scripts/sync-versions.mjs                   # rewrite sources to match package.json
 *   node scripts/sync-versions.mjs --check           # exit 1 if any source is out of sync (no write)
 *   node scripts/sync-versions.mjs --assert-released # exit 1 if any version is still 0.0.0 (publish guard)
 *
 * @module
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// `SYNC_VERSIONS_ROOT` lets tests point the script at a fixture monorepo; defaults to the repo.
const root = process.env.SYNC_VERSIONS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..')
const packagesDir = join(root, 'packages')
const check = process.argv.includes('--check')
const assertReleased = process.argv.includes('--assert-released')
const writeMode = !check && !assertReleased

// `export const VERSION = '...'` with single or double quotes.
const VERSION_RE = /(export const VERSION = )(['"])[^'"]*\2/

/** The source file that owns the `VERSION` constant for a package (cli keeps it in version.ts). */
function versionFileFor(pkgDir) {
  const candidates = [join(pkgDir, 'src', 'version.ts'), join(pkgDir, 'src', 'index.ts')]
  return candidates.find((file) => {
    try {
      return VERSION_RE.test(readFileSync(file, 'utf8'))
    } catch {
      return false
    }
  })
}

const drift = []
const unreleased = []
const missing = []
let changed = 0

for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const pkgDir = join(packagesDir, entry.name)
  let pkg
  try {
    pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
  } catch {
    continue
  }
  if (typeof pkg.version !== 'string') continue
  if (pkg.private === true) continue // skip private workspace packages (examples)

  if (pkg.version === '0.0.0') unreleased.push(pkg.name)

  const file = versionFileFor(pkgDir)
  if (!file) {
    // A publishable package with no VERSION export would ship unsynced — flag it loudly
    // rather than silently skipping.
    missing.push(pkg.name)
    continue
  }

  const source = readFileSync(file, 'utf8')
  const current = source.match(VERSION_RE)
  const currentValue = current ? current[0].slice(current[1].length + 1, -1) : undefined
  if (currentValue === pkg.version) continue

  if (writeMode) {
    writeFileSync(file, source.replace(VERSION_RE, `$1'${pkg.version}'`), 'utf8')
    console.log(`synced ${pkg.name} → ${pkg.version}`)
    changed++
  } else {
    drift.push(
      `${pkg.name}: source VERSION="${currentValue}" but package.json version="${pkg.version}"`,
    )
  }
}

if (assertReleased && unreleased.length > 0) {
  console.error(`Refusing to release 0.0.0 — bump these first:\n  ${unreleased.join('\n  ')}`)
  process.exit(1)
}
if (missing.length > 0) {
  console.error(
    `No \`export const VERSION = ...\` in src/version.ts or src/index.ts for:\n  ${missing.join('\n  ')}`,
  )
  process.exit(1)
}
if (check && drift.length > 0) {
  console.error(`Version drift — run: node scripts/sync-versions.mjs\n  ${drift.join('\n  ')}`)
  process.exit(1)
}
if (writeMode) {
  console.log(
    changed === 0 ? 'all package versions already in sync' : `synced ${changed} package(s)`,
  )
}
