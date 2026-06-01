import { describe, expect, it } from 'vitest'
import { buildProject } from './build'
import { createMemoryFileSystem } from './fs'

describe('buildProject', () => {
  it('compiles src TSX modules to dist JS', () => {
    const fs = createMemoryFileSystem({
      'src/App.tsx':
        'import { createElement } from "@mindees/core"\nexport const App = () => <view>hi</view>',
    })
    const result = buildProject(fs)
    expect(result.ok).toBe(true)
    expect(result.compiled).toEqual(['App.tsx'])
    const snap = fs.snapshot()
    expect(snap['dist/App.js']).toContain('createElement("view"')
    expect(snap['dist/App.js.map']).toBeDefined()
  })

  it('fails the build on a type error and emits no JS for that module', () => {
    const fs = createMemoryFileSystem({
      'src/bad.ts': 'export const n: number = "nope"',
    })
    const result = buildProject(fs)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((d) => d.code === 'TS2322')).toBe(true)
    expect(fs.snapshot()['dist/bad.js']).toBeUndefined()
  })

  it('accumulates flatten stats across modules', () => {
    const fs = createMemoryFileSystem({
      'src/a.tsx':
        'import { createElement } from "@mindees/core"\nexport const a = <view><text>x</text></view>',
    })
    const result = buildProject(fs)
    expect(result.stats.totalElements).toBe(2)
    expect(result.stats.flattenedNodes).toBe(1)
  })

  it('ignores .d.ts and non-source files', () => {
    const fs = createMemoryFileSystem({
      'src/types.d.ts': 'export type X = number',
      'src/readme.md': '# hi',
      'src/App.tsx':
        'import { createElement } from "@mindees/core"\nexport const App = () => <view/>',
    })
    const result = buildProject(fs)
    expect(result.compiled).toEqual(['App.tsx'])
  })

  it('emits a route manifest when src/routes exists', () => {
    const fs = createMemoryFileSystem({
      'src/routes/index.tsx':
        'import { createElement } from "@mindees/core"\nexport default () => <view/>',
      'src/routes/blog/[slug].tsx':
        'import { createElement } from "@mindees/core"\nexport default () => <view/>',
    })
    const result = buildProject(fs)
    expect(result.ok).toBe(true)
    expect(result.routes?.routes.some((r) => r.routePath === '/blog/:slug')).toBe(true)
    expect(fs.snapshot()['dist/routes.manifest.json']).toContain('/blog/:slug')
  })

  it('handles an empty project (no src)', () => {
    const fs = createMemoryFileSystem()
    const result = buildProject(fs)
    expect(result.ok).toBe(true)
    expect(result.compiled).toEqual([])
  })
})
