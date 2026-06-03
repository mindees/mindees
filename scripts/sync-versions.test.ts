import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), 'sync-versions.mjs')
const roots: string[] = []

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

interface Pkg {
  name: string
  version: string
  /** Source `VERSION` literal, or `null` for no VERSION export, or 'version.ts' to use that file. */
  source: string | null
  file?: 'index.ts' | 'version.ts'
  private?: boolean
}

/** Build a fixture monorepo and return its root (auto-cleaned). */
function fixture(pkgs: Pkg[]): string {
  const root = mkdtempSync(join(tmpdir(), 'syncver-'))
  roots.push(root)
  for (const pkg of pkgs) {
    const dir = join(root, 'packages', pkg.name.replace(/[@/]/g, '_'))
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: pkg.name,
        version: pkg.version,
        ...(pkg.private ? { private: true } : {}),
      }),
    )
    if (pkg.source !== null) {
      writeFileSync(
        join(dir, 'src', pkg.file ?? 'index.ts'),
        `export const VERSION = '${pkg.source}'\n`,
      )
    } else {
      writeFileSync(join(dir, 'src', 'index.ts'), 'export const name = "x"\n')
    }
  }
  return root
}

/** Run the script against a fixture root; returns { code, stdout, stderr }. */
function run(root: string, ...args: string[]): { code: number; out: string; err: string } {
  try {
    const out = execFileSync('node', [scriptPath, ...args], {
      env: { ...process.env, SYNC_VERSIONS_ROOT: root },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out, err: '' }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    return { code: err.status ?? 1, out: err.stdout ?? '', err: err.stderr ?? '' }
  }
}

function sourceVersion(root: string, pkgFolder: string, file = 'index.ts'): string {
  const src = readFileSync(join(root, 'packages', pkgFolder, 'src', file), 'utf8')
  return src.match(/export const VERSION = '([^']*)'/)?.[1] ?? ''
}

describe('sync-versions guard', () => {
  it('--check fails on drift, then a write fixes it', () => {
    const root = fixture([{ name: '@x/a', version: '1.2.3', source: '0.0.0' }])
    expect(run(root, '--check').code).toBe(1) // source 0.0.0 ≠ package.json 1.2.3
    expect(run(root).code).toBe(0) // write
    expect(sourceVersion(root, '_x_a')).toBe('1.2.3')
    expect(run(root, '--check').code).toBe(0) // now in sync
  })

  it('--check passes when already in sync', () => {
    const root = fixture([{ name: '@x/a', version: '2.0.0', source: '2.0.0' }])
    expect(run(root, '--check').code).toBe(0)
  })

  it('--assert-released refuses 0.0.0 (the publish guard)', () => {
    const root = fixture([
      { name: '@x/a', version: '1.0.0', source: '1.0.0' },
      { name: '@x/b', version: '0.0.0', source: '0.0.0' },
    ])
    const r = run(root, '--check', '--assert-released')
    expect(r.code).toBe(1)
    expect(r.err).toContain('@x/b')
  })

  it('--assert-released does not rewrite files', () => {
    const root = fixture([{ name: '@x/a', version: '1.2.3', source: '0.0.0' }])
    run(root, '--assert-released') // drifted but not 0.0.0 → no unreleased; must not write
    expect(sourceVersion(root, '_x_a')).toBe('0.0.0') // unchanged
  })

  it('syncs the cli-style version.ts file', () => {
    const root = fixture([
      { name: '@x/cli', version: '3.1.0', source: '0.0.0', file: 'version.ts' },
    ])
    expect(run(root).code).toBe(0)
    expect(sourceVersion(root, '_x_cli', 'version.ts')).toBe('3.1.0')
  })

  it('skips private packages (no VERSION required)', () => {
    const root = fixture([{ name: '@x/example', version: '0.0.0', source: null, private: true }])
    expect(run(root, '--check', '--assert-released').code).toBe(0)
  })

  it('fails when a PUBLIC package has no VERSION export', () => {
    const root = fixture([{ name: '@x/a', version: '1.0.0', source: null }])
    const r = run(root, '--check')
    expect(r.code).toBe(1)
    expect(r.err).toContain('@x/a')
  })
})
