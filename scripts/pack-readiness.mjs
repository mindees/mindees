#!/usr/bin/env node

/**
 * Validate publishable package artifacts, not just workspace source.
 *
 * The source workspace can build and self-import while still publishing broken tarballs:
 * missing files, leaked `workspace:` dependencies, broken package bins, or unexpectedly
 * large artifacts. This script packs every public workspace package, inspects each
 * tarball, installs the tarballs into a temporary fixture, imports every public export
 * subpath, and executes packed CLI bins.
 */

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagesRoot = join(root, 'packages')
const commandTimeoutMs = 60_000
const maxPackageBytes = Number(process.env.PACK_READINESS_MAX_PACKAGE_BYTES ?? 2_000_000)
const maxTotalBytes = Number(process.env.PACK_READINESS_MAX_TOTAL_BYTES ?? 10_000_000)
const tempRoot = mkdtempSync(join(tmpdir(), 'mindees-pack-readiness-'))
const packDir = join(tempRoot, 'packs')
const fixtureDir = join(tempRoot, 'fixture')

mkdirSync(packDir, { recursive: true })
mkdirSync(fixtureDir, { recursive: true })

const packageManager = resolvePackageManager()
const packedPackages = []
const failures = []

try {
  for (const packageDir of publicPackageDirs()) {
    packedPackages.push(packAndInspect(packageDir))
  }

  validateSizeBudgets(packedPackages)
  installAndSmoke(packedPackages)
  printSummary(packedPackages)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  failures.push(message)
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error('\nPack readiness failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

function publicPackageDirs() {
  return readdirSync(packagesRoot)
    .map((name) => join(packagesRoot, name))
    .filter((dir) => statSync(dir).isDirectory() && existsSync(join(dir, 'package.json')))
    .filter((dir) => readJson(join(dir, 'package.json')).private !== true)
    .sort()
}

function packAndInspect(packageDir) {
  const sourceManifest = readJson(join(packageDir, 'package.json'))
  const pack = runPackageManager(`pack ${sourceManifest.name}`, [
    '--dir',
    packageDir,
    'pack',
    '--pack-destination',
    packDir,
    '--json',
  ])
  const packInfo = parsePackJson(sourceManifest.name, pack.stdout)
  const tarball = resolve(packInfo.filename)
  const tarballSize = statSync(tarball).size
  const entries = readTarGzEntries(tarball)
  const packedManifest = readPackedManifest(sourceManifest.name, entries)

  validateManifest(sourceManifest, packedManifest)
  validatePackedFiles(sourceManifest.name, packedManifest, entries)

  return {
    name: packedManifest.name,
    version: packedManifest.version,
    tarball,
    tarballSize,
    unpackedSize: [...entries.values()].reduce((sum, entry) => sum + entry.size, 0),
    entryCount: entries.size,
    exportSpecifiers: collectExportSpecifiers(packedManifest.name, packedManifest.exports),
  }
}

function installAndSmoke(packages) {
  const dependencies = Object.fromEntries(
    packages.map((pkg) => {
      const target = relative(fixtureDir, pkg.tarball).replaceAll('\\', '/')
      return [pkg.name, `file:${target.startsWith('.') ? target : `./${target}`}`]
    }),
  )
  writeFileSync(
    join(fixtureDir, 'package.json'),
    `${JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies,
      },
      null,
      2,
    )}\n`,
  )
  writeFileSync(
    join(fixtureDir, 'pnpm-workspace.yaml'),
    `packages:\n  - .\noverrides:\n${Object.entries(dependencies)
      .map(([name, spec]) => `  '${yamlSingleQuote(name)}': '${yamlSingleQuote(spec)}'`)
      .join('\n')}\n`,
  )

  runPackageManager(
    'install packed fixture',
    ['install', '--prefer-offline', '--ignore-scripts', '--no-frozen-lockfile'],
    {
      cwd: fixtureDir,
    },
  )

  const specifiers = packages.flatMap((pkg) => pkg.exportSpecifiers).sort()
  const importScript = `
    const specifiers = ${JSON.stringify(specifiers)};
    for (const specifier of specifiers) {
      const mod = await import(specifier);
      console.log(specifier + ' ' + Object.keys(mod).length);
    }
  `
  runNode('import packed exports', ['--input-type=module', '--eval', importScript], {
    cwd: fixtureDir,
  })

  const mindees = runPackageManager('packed mindees --help', ['exec', 'mindees', '--help'], {
    cwd: fixtureDir,
  })
  assertIncludes('packed mindees --help', mindees.stdout, 'Usage: mindees')

  const createMindees = runPackageManager(
    'packed create-mindees --help',
    ['exec', 'create-mindees', '--help'],
    { cwd: fixtureDir },
  )
  assertIncludes('packed create-mindees --help', createMindees.stdout, 'Usage: create-mindees')
}

function validateManifest(sourceManifest, packedManifest) {
  if (packedManifest.name !== sourceManifest.name) {
    failures.push(`${sourceManifest.name}: packed manifest name is ${packedManifest.name}`)
  }
  if (packedManifest.version !== sourceManifest.version) {
    failures.push(
      `${sourceManifest.name}: packed version ${packedManifest.version} does not match source ${sourceManifest.version}`,
    )
  }

  const dependencyFields = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]
  for (const field of dependencyFields) {
    for (const [name, range] of Object.entries(packedManifest[field] ?? {})) {
      if (typeof range === 'string' && range.startsWith('workspace:')) {
        failures.push(`${sourceManifest.name}: ${field}.${name} still uses ${range}`)
      }
    }
  }
}

function validatePackedFiles(packageName, manifest, entries) {
  const requiredFiles = ['package/package.json', 'package/README.md', 'package/LICENSE']
  for (const file of requiredFiles) {
    if (!entries.has(file)) failures.push(`${packageName}: tarball is missing ${file}`)
  }

  for (const target of collectExportTargets(manifest.exports)) {
    const path = archivePath(target)
    if (!entries.has(path)) failures.push(`${packageName}: tarball is missing export ${target}`)
  }

  for (const [binName, target] of Object.entries(normalizeBinTargets(packageName, manifest.bin))) {
    const path = archivePath(String(target))
    if (!entries.has(path)) failures.push(`${packageName}: tarball is missing bin ${binName}`)
  }

  for (const path of entries.keys()) {
    if (path.startsWith('package/src/')) {
      failures.push(`${packageName}: tarball includes source file ${path}`)
    }
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(path)) {
      failures.push(`${packageName}: tarball includes test file ${path}`)
    }
  }
}

function validateSizeBudgets(packages) {
  const total = packages.reduce((sum, pkg) => sum + pkg.tarballSize, 0)
  if (total > maxTotalBytes) {
    failures.push(
      `packed tarballs total ${formatBytes(total)} exceeds ${formatBytes(maxTotalBytes)}`,
    )
  }
  for (const pkg of packages) {
    if (pkg.tarballSize > maxPackageBytes) {
      failures.push(
        `${pkg.name}: tarball ${formatBytes(pkg.tarballSize)} exceeds ${formatBytes(maxPackageBytes)}`,
      )
    }
  }
}

function printSummary(packages) {
  const total = packages.reduce((sum, pkg) => sum + pkg.tarballSize, 0)
  const largest = [...packages].sort((a, b) => b.tarballSize - a.tarballSize)[0]
  for (const pkg of packages) {
    console.log(
      `${pkg.name} ${pkg.version}: ${formatBytes(pkg.tarballSize)} packed, ${formatBytes(
        pkg.unpackedSize,
      )} unpacked, ${pkg.entryCount} entries`,
    )
  }
  console.log(
    `pack-readiness: packed ${packages.length} package(s), ${packages.reduce(
      (sum, pkg) => sum + pkg.exportSpecifiers.length,
      0,
    )} export specifier(s), total ${formatBytes(total)}, largest ${largest.name} ${formatBytes(
      largest.tarballSize,
    )}`,
  )
}

function parsePackJson(packageName, stdout) {
  try {
    const parsed = JSON.parse(stdout.trim())
    return Array.isArray(parsed) ? parsed[0] : parsed
  } catch (error) {
    throw new Error(`${packageName}: could not parse pnpm pack --json output: ${error.message}`)
  }
}

function readPackedManifest(packageName, entries) {
  const manifest = entries.get('package/package.json')
  if (!manifest) throw new Error(`${packageName}: packed tarball is missing package.json`)
  return JSON.parse(manifest.content.toString('utf8'))
}

function readTarGzEntries(path) {
  const bytes = gunzipSync(readFileSync(path))
  const entries = new Map()
  let offset = 0

  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512)
    offset += 512
    if (header.every((byte) => byte === 0)) break

    const name = readNullTerminated(header, 0, 100)
    const prefix = readNullTerminated(header, 345, 155)
    const sizeText = readNullTerminated(header, 124, 12).trim()
    const size = sizeText.length > 0 ? Number.parseInt(sizeText, 8) : 0
    const fullName = prefix ? `${prefix}/${name}` : name
    const content = bytes.subarray(offset, offset + size)
    entries.set(fullName, { content, size })
    offset += Math.ceil(size / 512) * 512
  }

  return entries
}

function readNullTerminated(buffer, start, length) {
  const slice = buffer.subarray(start, start + length)
  const end = slice.indexOf(0)
  return Buffer.from(end === -1 ? slice : slice.subarray(0, end)).toString('utf8')
}

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

function archivePath(target) {
  return `package/${target.replace(/^\.\//, '')}`
}

function normalizeBinTargets(packageName, binField) {
  if (typeof binField === 'string') return { [packageName]: binField }
  if (binField === undefined) return {}
  if (isPlainObject(binField)) return binField

  failures.push(`${packageName}: manifest bin must be a string or object`)
  return {}
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function runPackageManager(label, args, options = {}) {
  return run(label, packageManager.command, [...packageManager.args, ...args], options)
}

function runNode(label, args, options = {}) {
  return run(label, process.execPath, args, options)
}

function run(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: process.env,
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
  if (result.status !== 0) {
    throw new Error(`${label}: expected exit 0\n${commandOutput(result)}`)
  }
  return result
}

function resolvePackageManager() {
  const npmExecPath = process.env.npm_execpath
  if (npmExecPath && basename(npmExecPath).toLowerCase().includes('pnpm')) {
    return { command: process.execPath, args: [npmExecPath] }
  }
  return { command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args: [] }
}

function assertIncludes(label, text, needle) {
  if (!text.includes(needle)) {
    throw new Error(`${label}: expected output to include ${JSON.stringify(needle)}`)
  }
}

function commandOutput(result) {
  return [
    `exit=${result.status ?? 'null'} signal=${result.signal ?? 'none'}`,
    `stdout:\n${excerpt(result.stdout ?? '') || '(empty)'}`,
    `stderr:\n${excerpt(result.stderr ?? '') || '(empty)'}`,
  ].join('\n')
}

function excerpt(text) {
  const trimmed = text.trim()
  if (trimmed.length <= 2000) return trimmed
  return `${trimmed.slice(0, 2000)}...`
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
}

function yamlSingleQuote(value) {
  return String(value).replaceAll("'", "''")
}
