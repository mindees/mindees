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

  it('reports a duplicate route path as a build error instead of crashing', () => {
    // `src/routes/index.tsx` and the route-group `src/routes/(app)/index.tsx`
    // both map to "/", which makes buildRouteManifest throw. The CLI must catch
    // it and fail cleanly, not propagate a raw exception.
    const fs = createMemoryFileSystem({
      'src/routes/index.tsx':
        'import { createElement } from "@mindees/core"\nexport default () => <view/>',
      'src/routes/(app)/index.tsx':
        'import { createElement } from "@mindees/core"\nexport default () => <view/>',
    })
    let result!: ReturnType<typeof buildProject>
    expect(() => {
      result = buildProject(fs)
    }).not.toThrow()
    expect(result.ok).toBe(false)
    const routeErr = result.diagnostics.find((d) => d.code === 'MDC_ROUTES')
    expect(routeErr?.severity).toBe('error')
    expect(routeErr?.file).toBe('src/routes') // points at the routes dir, not hardcoded elsewhere
  })

  it('reports a non-terminal catch-all route as a build error instead of crashing', () => {
    // `[...rest]` is not the last segment → fileToRoute throws; must be reported.
    const fs = createMemoryFileSystem({
      'src/routes/[...rest]/edit.tsx':
        'import { createElement } from "@mindees/core"\nexport default () => <view/>',
    })
    let result!: ReturnType<typeof buildProject>
    expect(() => {
      result = buildProject(fs)
    }).not.toThrow()
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((d) => d.code === 'MDC_ROUTES')).toBe(true)
  })

  it('handles an empty project (no src)', () => {
    const fs = createMemoryFileSystem()
    const result = buildProject(fs)
    expect(result.ok).toBe(true)
    expect(result.compiled).toEqual([])
  })

  it('does not manifest a .jsx route the build never compiles (no dangling chunk)', () => {
    const fs = createMemoryFileSystem({
      'src/routes/index.tsx': `import { createElement } from "@mindees/core"
export default () => <view/>`,
      'src/routes/about.jsx': 'export default () => null',
    })
    const result = buildProject(fs)
    expect(result.ok).toBe(true)
    // the .jsx route has no emitted chunk → it must not appear in the manifest
    expect(result.routes?.routes.some((r) => r.routePath === '/about')).toBe(false)
  })

  it('rewrites source-map sources to resolve to the real src/ file', () => {
    const fs = createMemoryFileSystem({
      'src/App.tsx': `import { createElement } from "@mindees/core"
export const App = () => <view/>`,
    })
    const result = buildProject(fs)
    expect(result.ok).toBe(true)
    const map = JSON.parse(fs.snapshot()['dist/App.js.map'] as string)
    expect(map.sources).toEqual(['../src/App.tsx']) // resolves dist/ -> src/, not a non-existent dist/App.tsx
    expect(map.sourceRoot).toBe('')
  })

  it('reports an output collision (App.ts + App.tsx -> one dist/App.js) instead of overwriting', () => {
    const fs = createMemoryFileSystem({
      'src/App.ts': 'export const fromTs = 1',
      'src/App.tsx': `import { createElement } from "@mindees/core"
export const App = () => <view/>`,
    })
    const result = buildProject(fs)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((d) => d.code === 'MDC_OUTPUT_COLLISION')).toBe(true)
  })

  it('emits a runnable index.html with an import-map when an app entry compiles', () => {
    const fs = createMemoryFileSystem({
      'src/App.tsx': `import { createElement } from "@mindees/core"
export const App = () => <view>hi</view>`,
      'src/main.tsx': `import { App } from "./App"
export const main = App`,
    })
    const result = buildProject(fs, { appName: 'My App' })
    expect(result.ok).toBe(true)
    expect(result.htmlEmitted).toBe(true)
    const snap = fs.snapshot()
    const html = snap['dist/index.html'] as string
    expect(html).toContain('<div id="app"></div>')
    expect(html).toContain('<title>My App</title>')
    expect(html).toContain('"@mindees/renderer": "https://esm.sh/@mindees/renderer@')
    expect(html).toContain('"@mindees/atlas/": "https://esm.sh/@mindees/atlas@') // subpath mapping
    expect(html).toContain('<script type="module" src="./main.js">')
    expect(snap['dist/main.js']).toContain('from "./App.js"') // relative imports rewritten for native ESM
  })

  it('does not emit index.html without an app entry, or when html:false', () => {
    const fs = createMemoryFileSystem({
      'src/util.tsx': `import { createElement } from "@mindees/core"
export const x = () => <view/>`,
    })
    expect(buildProject(fs).htmlEmitted).toBeUndefined() // no src/main → no shell
    expect(fs.snapshot()['dist/index.html']).toBeUndefined()

    const withMain = createMemoryFileSystem({ 'src/main.tsx': 'export const main = 1' })
    expect(buildProject(withMain, { html: false }).htmlEmitted).toBeUndefined() // explicitly disabled
    expect(withMain.snapshot()['dist/index.html']).toBeUndefined()
  })
})
