import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), 'validate-exports.mjs')
const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'validate-exports-'))
  roots.push(root)
  return root
}

function writePackage(
  root: string,
  folder: string,
  manifest: unknown,
  files: Record<string, string>,
) {
  const packageDir = join(root, 'packages', folder)
  mkdirSync(packageDir, { recursive: true })
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify(manifest, null, 2))

  for (const [path, contents] of Object.entries(files)) {
    const absolute = join(packageDir, path)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, contents)
  }
}

function run(root: string): { code: number; out: string; err: string } {
  try {
    const out = execFileSync(process.execPath, [scriptPath], {
      env: { ...process.env, VALIDATE_EXPORTS_ROOT: root },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out, err: '' }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    return { code: err.status ?? 1, out: err.stdout ?? '', err: err.stderr ?? '' }
  }
}

describe('validate-exports', () => {
  it('imports a package that uses conditional exports shorthand', () => {
    const root = fixture()
    writePackage(
      root,
      'shortcut',
      {
        name: '@x/shortcut',
        type: 'module',
        exports: {
          types: './dist/index.d.ts',
          import: './dist/index.js',
        },
      },
      {
        'dist/index.d.ts': 'export declare const ok: true\n',
        'dist/index.js': 'export const ok = true\n',
      },
    )

    const result = run(root)

    expect(result.code).toBe(0)
    expect(result.out).toContain('@x/shortcut 1')
    expect(result.out).toContain('validate-exports: checked 1 specifier(s)')
  })

  it('fails a broken import that uses conditional exports shorthand', () => {
    const root = fixture()
    writePackage(
      root,
      'broken',
      {
        name: '@x/broken',
        type: 'module',
        exports: {
          types: './dist/index.d.ts',
          import: './dist/index.js',
        },
      },
      {
        'dist/index.d.ts': 'export declare const ok: true\n',
        'dist/index.js': 'throw new Error("broken export")\n',
      },
    )

    const result = run(root)

    expect(result.code).toBe(1)
    expect(result.err).toContain('failed to import @x/broken')
    expect(result.err).toContain('broken export')
  })
})
