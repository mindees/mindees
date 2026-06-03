import { describe, expect, it } from 'vitest'
import { parseCreateCommand } from './args'

describe('parseCreateCommand', () => {
  it('treats --help as successful help output', () => {
    const parsed = parseCreateCommand(['--help'], 'E:/MiND/mindees')

    expect(parsed.kind).toBe('help')
    if (parsed.kind !== 'help') return
    expect(parsed.exitCode).toBe(0)
    expect(parsed.usage).toMatch(/Usage: create-mindees/)
  })

  it('derives target path and package name from a Windows absolute path', () => {
    const parsed = parseCreateCommand(['E:\\MiND\\mindees-create-smoke'], 'E:/MiND/mindees')

    expect(parsed.kind).toBe('create')
    if (parsed.kind !== 'create') return
    expect(parsed.args.appName).toBe('mindees-create-smoke')
    expect(parsed.args.targetDir).toBe('E:/MiND/mindees-create-smoke')
    expect(parsed.displayDir).toBe('E:/MiND/mindees-create-smoke')
  })
})
