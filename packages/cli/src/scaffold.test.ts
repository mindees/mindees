import { describe, expect, it } from 'vitest'
import { createMemoryFileSystem } from './fs'
import { scaffold } from './scaffold'

describe('scaffold', () => {
  it('writes the blank template into the target dir', () => {
    const fs = createMemoryFileSystem()
    const result = scaffold(fs, { appName: 'my-app', targetDir: 'my-app' })
    expect(result.ok).toBe(true)
    expect(result.template).toBe('blank')
    expect(result.written).toContain('package.json')
    expect(result.written).toContain('src/App.tsx')

    const snap = fs.snapshot()
    expect(snap['my-app/package.json']).toContain('"name": "my-app"')
    expect(snap['my-app/src/App.tsx']).toContain('Hello from my-app')
  })

  it('scaffolds the counter template with signals', () => {
    const fs = createMemoryFileSystem()
    const result = scaffold(fs, { appName: 'c', targetDir: 'c', template: 'counter' })
    expect(result.ok).toBe(true)
    expect(fs.snapshot()['c/src/App.tsx']).toContain('signal(0)')
  })

  it('substitutes the appName placeholder everywhere', () => {
    const fs = createMemoryFileSystem()
    scaffold(fs, { appName: 'cool-app', targetDir: 'out' })
    const snap = fs.snapshot()
    for (const contents of Object.values(snap)) {
      expect(contents).not.toContain('{{appName}}')
    }
    expect(snap['out/README.md']).toContain('cool-app')
  })

  it('rejects an unknown template', () => {
    const fs = createMemoryFileSystem()
    const result = scaffold(fs, { appName: 'x', targetDir: 'x', template: 'nope' })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Unknown template/)
  })

  it('refuses a non-empty target without force', () => {
    const fs = createMemoryFileSystem({ 'x/existing.txt': 'hi' })
    const result = scaffold(fs, { appName: 'x', targetDir: 'x' })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/not empty/)
  })

  it('overwrites a non-empty target with force', () => {
    const fs = createMemoryFileSystem({ 'x/existing.txt': 'hi' })
    const result = scaffold(fs, { appName: 'x', targetDir: 'x', force: true })
    expect(result.ok).toBe(true)
  })

  it('reports a clean error (never throws) when the target exists but is a FILE', () => {
    // The real readDir adapter throws ENOTDIR on a file; scaffold must catch it and
    // return a ScaffoldResult, honoring the CLI's "never throws for expected failures".
    const base = createMemoryFileSystem()
    const fileFs = {
      ...base,
      exists: (p: string) => p === 'foo' || base.exists(p),
      readDir: (p: string) => {
        if (p === 'foo') throw new Error('ENOTDIR: not a directory')
        return base.readDir(p)
      },
    }
    let result!: ReturnType<typeof scaffold>
    expect(() => {
      result = scaffold(fileFs, { appName: 'foo', targetDir: 'foo' })
    }).not.toThrow()
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/could not be read/)
  })

  it('produces a package.json depending on the framework packages', () => {
    const fs = createMemoryFileSystem()
    scaffold(fs, { appName: 'app', targetDir: 'app' })
    const pkg = JSON.parse(fs.snapshot()['app/package.json'] as string)
    expect(pkg.dependencies['@mindees/core']).toBeDefined()
    expect(pkg.dependencies['@mindees/renderer']).toBeDefined()
    expect(pkg.scripts.dev).toBe('mindees dev')
  })

  it('declares the mindees CLI so `mindees dev`/`build` resolve after install', () => {
    const fs = createMemoryFileSystem()
    scaffold(fs, { appName: 'app', targetDir: 'app' })
    const pkg = JSON.parse(fs.snapshot()['app/package.json'] as string)
    expect(pkg.devDependencies['@mindees/cli']).toBeDefined()
    // All scaffolded @mindees/* deps share the one locked version line.
    expect(pkg.devDependencies['@mindees/cli']).toBe(pkg.dependencies['@mindees/core'])
  })

  it('--force overlays the template, preserving pre-existing extra files', () => {
    const fs = createMemoryFileSystem({ 'app/keepme.txt': 'user data' })
    const result = scaffold(fs, { appName: 'x', targetDir: 'app', force: true })
    expect(result.ok).toBe(true)
    expect(result.written.length).toBeGreaterThan(0) // template files written
    expect(fs.snapshot()['app/keepme.txt']).toBe('user data') // extra file kept (merge, not wipe)
  })
})
