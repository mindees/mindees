import { createMemoryFileSystem } from '@mindees/cli'
import { describe, expect, it } from 'vitest'
import { runCreate } from './index'

describe('runCreate (create-mindees)', () => {
  it('scaffolds the blank template by default', () => {
    const fs = createMemoryFileSystem()
    const result = runCreate(fs, { appName: 'app', targetDir: 'app' })
    expect(result.ok).toBe(true)
    expect(result.template).toBe('blank')
    expect(fs.exists('app/package.json')).toBe(true)
  })

  it('honors an explicit template', () => {
    const fs = createMemoryFileSystem()
    const result = runCreate(fs, { appName: 'c', targetDir: 'c', template: 'counter' })
    expect(result.ok).toBe(true)
    expect(result.template).toBe('counter')
  })

  it('resolves a prompt to a template (offline keyword mapping)', () => {
    const fs = createMemoryFileSystem()
    const result = runCreate(fs, { appName: 'c', targetDir: 'c', prompt: 'a reactive counter' })
    expect(result.ok).toBe(true)
    expect(result.template).toBe('counter')
  })

  it('refuses a non-empty target without force', () => {
    const fs = createMemoryFileSystem({ 'c/x.txt': 'hi' })
    expect(runCreate(fs, { appName: 'c', targetDir: 'c' }).ok).toBe(false)
  })

  it('produces the same output as @mindees/cli scaffold (shared core)', () => {
    const fs = createMemoryFileSystem()
    const result = runCreate(fs, { appName: 'app', targetDir: 'app' })
    expect(result.written).toContain('src/main.tsx')
    expect(fs.snapshot()['app/src/App.tsx']).toContain('createElement')
  })
})
