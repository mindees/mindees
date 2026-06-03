import { createMockBackend } from '@mindees/ai'
import { describe, expect, it } from 'vitest'
import { type CliContext, runCliAsync } from './cli'
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
  return { ctx, text, errText }
}

const explanation = JSON.stringify({
  summary: 'You called a method on undefined.',
  likelyCauses: ['The value was never initialized'],
  suggestedFixes: ['Add a guard before the call'],
})

describe('mindees ai explain', () => {
  it('explains an error via the injected backend', async () => {
    const { ctx, text } = makeCtx({ aiBackend: createMockBackend({ reply: explanation }) })
    const result = await runCliAsync(['ai', 'explain', 'TypeError: x is not a function'], ctx)
    expect(result.exitCode).toBe(0)
    expect(text()).toContain('Summary: You called a method on undefined.')
    expect(text()).toContain('• Add a guard before the call')
  })

  it('errors clearly when no backend is configured', async () => {
    const { ctx, errText } = makeCtx()
    const result = await runCliAsync(['ai', 'explain', 'some error'], ctx)
    expect(result.exitCode).toBe(1)
    expect(errText()).toMatch(/No AI backend configured/)
  })

  it('errors when no error message is given', async () => {
    const { ctx, errText } = makeCtx({ aiBackend: createMockBackend({ reply: explanation }) })
    const result = await runCliAsync(['ai', 'explain'], ctx)
    expect(result.exitCode).toBe(1)
    expect(errText()).toMatch(/provide an error message/)
  })

  it('prints ai help for a bare `ai`', async () => {
    const { ctx, text } = makeCtx()
    const result = await runCliAsync(['ai'], ctx)
    expect(result.exitCode).toBe(0)
    expect(text()).toMatch(/mindees ai explain/)
  })

  it('rejects an unknown ai subcommand', async () => {
    const { ctx, errText } = makeCtx()
    const result = await runCliAsync(['ai', 'frobnicate'], ctx)
    expect(result.exitCode).toBe(1)
    expect(errText()).toMatch(/Unknown ai command/)
  })

  it('delegates non-ai commands to the sync runCli', async () => {
    const { ctx, text } = makeCtx()
    const result = await runCliAsync(['--version'], ctx)
    expect(result.exitCode).toBe(0)
    expect(text()).toBe('0.0.0')
  })
})
