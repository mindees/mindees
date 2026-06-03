import { describe, expect, it } from 'vitest'
import { type CliContext, runCli } from './cli'
import { createMemoryFileSystem } from './fs'
import type { EnvProbe, OutputLine } from './types'

const env: EnvProbe = {
  nodeVersion: 'v24.7.0',
  packageManager: { name: 'pnpm', version: '11.5.0' },
  hasPackageJson: true,
  hasNodeModules: true,
}

function makeCtx(overrides: Partial<CliContext> = {}) {
  const lines: OutputLine[] = []
  const ctx: CliContext = {
    fs: createMemoryFileSystem(),
    env,
    cwd: '.',
    version: '0.0.0',
    write: (l) => lines.push(l),
    ...overrides,
  }
  const text = () => lines.map((l) => l.text).join('\n')
  const errText = () =>
    lines
      .filter((l) => l.stream === 'err')
      .map((l) => l.text)
      .join('\n')
  return { ctx, lines, text, errText }
}

describe('runCli — dispatch', () => {
  it('prints help with no command', () => {
    const { ctx, text } = makeCtx()
    expect(runCli([], ctx).exitCode).toBe(0)
    expect(text()).toMatch(/Usage: mindees/)
  })

  it('prints the version', () => {
    const { ctx, text } = makeCtx()
    expect(runCli(['--version'], ctx).exitCode).toBe(0)
    expect(text()).toBe('0.0.0')
  })

  it('errors on an unknown command', () => {
    const { ctx, errText } = makeCtx()
    expect(runCli(['frobnicate'], ctx).exitCode).toBe(1)
    expect(errText()).toMatch(/Unknown command/)
  })
})

describe('runCli — create', () => {
  it('prints create help without requiring an app name', () => {
    const { ctx, text, errText } = makeCtx()
    const result = runCli(['create', '--help'], ctx)
    expect(result.exitCode).toBe(0)
    expect(text()).toMatch(/Usage: mindees create/)
    expect(errText()).toBe('')
  })

  it('scaffolds an app into cwd', () => {
    const { ctx, text } = makeCtx({ cwd: 'work' })
    const r = runCli(['create', 'my-app'], ctx)
    expect(r.exitCode).toBe(0)
    expect(text()).toMatch(/Created "my-app"/)
    expect(ctx.fs.exists('work/my-app/package.json')).toBe(true)
  })

  it('resolves a Windows absolute target and uses its basename as the package name', () => {
    const { ctx, text } = makeCtx({ cwd: 'E:/MiND/mindees' })
    const result = runCli(['create', 'E:\\MiND\\mindees-create-smoke'], ctx)

    expect(result.exitCode).toBe(0)
    expect(ctx.fs.exists('E:/MiND/mindees-create-smoke/package.json')).toBe(true)
    expect(ctx.fs.exists('E:/MiND/mindees/E:/MiND/mindees-create-smoke/package.json')).toBe(false)

    const snap = (ctx.fs as ReturnType<typeof createMemoryFileSystem>).snapshot()
    const pkg = JSON.parse(snap['E:/MiND/mindees-create-smoke/package.json'] as string)
    expect(pkg.name).toBe('mindees-create-smoke')
    expect(text()).toMatch(/Created "mindees-create-smoke"/)
    expect(text()).toMatch(/Next: cd "E:\/MiND\/mindees-create-smoke"/)
  })

  it('resolves a relative parent target before scaffolding', () => {
    const { ctx } = makeCtx({ cwd: 'E:/MiND/mindees' })
    const result = runCli(['create', '..\\mindees-create-smoke'], ctx)

    expect(result.exitCode).toBe(0)
    expect(ctx.fs.exists('E:/MiND/mindees-create-smoke/package.json')).toBe(true)

    const snap = (ctx.fs as ReturnType<typeof createMemoryFileSystem>).snapshot()
    const pkg = JSON.parse(snap['E:/MiND/mindees-create-smoke/package.json'] as string)
    expect(pkg.name).toBe('mindees-create-smoke')
  })

  it('sanitizes a path basename into a valid npm package name', () => {
    const { ctx, text } = makeCtx()
    const result = runCli(['create', 'My App!'], ctx)

    expect(result.exitCode).toBe(0)
    const snap = (ctx.fs as ReturnType<typeof createMemoryFileSystem>).snapshot()
    const pkg = JSON.parse(snap['My App!/package.json'] as string)
    expect(pkg.name).toBe('my-app')
    expect(text()).toMatch(/Next: cd "My App!"/)
  })

  it('requires an app name', () => {
    const { ctx, errText } = makeCtx()
    expect(runCli(['create'], ctx).exitCode).toBe(1)
    expect(errText()).toMatch(/missing app name/)
  })

  it('honors --template', () => {
    const { ctx } = makeCtx()
    runCli(['create', 'c', '--template', 'counter'], ctx)
    expect(ctx.fs.exists('c/src/App.tsx')).toBe(true)
    expect(
      (ctx.fs as ReturnType<typeof createMemoryFileSystem>).snapshot()['c/src/App.tsx'],
    ).toContain('signal(0)')
  })

  it('maps --prompt to a template deterministically', () => {
    const { ctx, text } = makeCtx()
    runCli(['create', 'c', '--prompt', 'a counter with a button'], ctx)
    expect(text()).toMatch(/counter.*template/)
    expect(ctx.fs.exists('c/src/App.tsx')).toBe(true)
  })

  it('prefers an explicit --template over a conflicting --prompt', () => {
    const { ctx } = makeCtx()
    // Prompt maps to the default (blank); explicit --template counter must win.
    runCli(['create', 'c', '--template', 'counter', '--prompt', 'a blank screen'], ctx)
    expect(
      (ctx.fs as ReturnType<typeof createMemoryFileSystem>).snapshot()['c/src/App.tsx'],
    ).toContain('signal(0)')
  })

  it('fails clearly on an unknown template', () => {
    const { ctx, errText } = makeCtx()
    expect(runCli(['create', 'x', '--template', 'nope'], ctx).exitCode).toBe(1)
    expect(errText()).toMatch(/Unknown template/)
  })
})

describe('runCli — build', () => {
  it('builds a project and reports stats', () => {
    const fs = createMemoryFileSystem({
      'src/App.tsx':
        'import { createElement } from "@mindees/core"\nexport const App = () => <view><text>x</text></view>',
    })
    const { ctx, text } = makeCtx({ fs })
    expect(runCli(['build'], ctx).exitCode).toBe(0)
    expect(text()).toMatch(/Built 1 module/)
    expect(fs.exists('dist/App.js')).toBe(true)
  })

  it('exits non-zero and prints diagnostics on a type error', () => {
    const fs = createMemoryFileSystem({ 'src/bad.ts': 'export const n: number = "no"' })
    const { ctx, errText } = makeCtx({ fs })
    expect(runCli(['build'], ctx).exitCode).toBe(1)
    expect(errText()).toMatch(/TS2322/)
    expect(errText()).toMatch(/Build failed/)
  })
})

describe('runCli — doctor & info', () => {
  it('doctor exits 0 on a healthy env', () => {
    const { ctx, text } = makeCtx()
    expect(runCli(['doctor'], ctx).exitCode).toBe(0)
    expect(text()).toMatch(/Node\.js/)
  })

  it('doctor exits 1 when a check fails', () => {
    const { ctx } = makeCtx({ env: { ...env, nodeVersion: 'v18.0.0' } })
    expect(runCli(['doctor'], ctx).exitCode).toBe(1)
  })

  it('info prints CLI + env details', () => {
    const { ctx, text } = makeCtx()
    expect(runCli(['info'], ctx).exitCode).toBe(0)
    expect(text()).toMatch(/mindees CLI 0\.0\.0/)
    expect(text()).toMatch(/pnpm 11\.5\.0/)
  })
})
