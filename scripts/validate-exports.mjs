#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(process.env.VALIDATE_EXPORTS_ROOT ?? defaultRoot)
const packagesRoot = join(root, 'packages')
const packageDirs = readdirSync(packagesRoot)
  .map((name) => join(packagesRoot, name))
  .filter((dir) => statSync(dir).isDirectory() && existsSync(join(dir, 'package.json')))
  .sort()

const failures = []
let importCount = 0

for (const packageDir of packageDirs) {
  const manifestPath = join(packageDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

  if (manifest.private || !manifest.exports) continue

  const exportTargets = collectExportTargets(manifest.exports)
  for (const target of exportTargets) {
    const absolute = join(packageDir, target)
    if (!existsSync(absolute)) {
      failures.push(`${manifest.name}: export target ${target} does not exist`)
    }
  }

  for (const [binName, target] of Object.entries(manifest.bin ?? {})) {
    const absolute = join(packageDir, String(target))
    if (!existsSync(absolute)) {
      failures.push(`${manifest.name}: bin ${binName} target ${target} does not exist`)
    }
  }

  for (const specifier of collectExportSpecifiers(manifest.name, manifest.exports)) {
    importCount += 1
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
          const mod = await import(${JSON.stringify(specifier)});
          const keys = Object.keys(mod);
          console.log(${JSON.stringify(specifier)} + ' ' + keys.length);
        `,
      ],
      { cwd: packageDir, encoding: 'utf8' },
    )

    if (result.status !== 0) {
      failures.push(
        `${manifest.name}: failed to import ${specifier} from ${packageDir}\n${indent(
          result.stderr || result.stdout || `node exited ${result.status}`,
        )}`,
      )
    } else {
      process.stdout.write(result.stdout)
    }
  }
}

if (failures.length > 0) {
  console.error('\nExport validation failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(
  `validate-exports: checked ${importCount} specifier(s) across ${packageDirs.length} package(s)`,
)

function collectExportSpecifiers(packageName, exportsField) {
  if (typeof exportsField === 'string') return [packageName]
  if (!isPlainObject(exportsField)) return []

  const keys = Object.keys(exportsField)
  const specifiers = []
  for (const key of keys) {
    if (key === '.') specifiers.push(packageName)
    else if (key.startsWith('./')) specifiers.push(`${packageName}/${key.slice(2)}`)
  }
  if (specifiers.length === 0 && keys.length > 0) specifiers.push(packageName)
  return specifiers.sort()
}

function collectExportTargets(value, targets = new Set()) {
  if (typeof value === 'string') {
    if (value.startsWith('./')) targets.add(value)
    return targets
  }

  if (!isPlainObject(value)) return targets

  for (const nested of Object.values(value)) collectExportTargets(nested, targets)
  return [...targets].sort()
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function indent(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => `  ${line}`)
    .join('\n')
}
