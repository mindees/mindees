import { describe, expect, it, vi } from 'vitest'
import { createDevServer, createNodeWatcher, renderDevPage, type WatchFn } from './dev-server'

describe('createNodeWatcher', () => {
  /** A fake fs.watch that lets the test fire events at the registered listener. */
  function fakeWatch() {
    const fire: Array<(event: string, filename: string | null) => void> = []
    const closed: boolean[] = []
    const watch: WatchFn = (_path, _opts, listener) => {
      fire.push(listener)
      const i = closed.length
      closed.push(false)
      return {
        close() {
          closed[i] = true
        },
      }
    }
    return { watch, fire, closed }
  }
  // Run debounce timers immediately so the test stays synchronous.
  const immediate = { setTimer: (fn: () => void) => (fn(), 0), clearTimer: () => {} }

  it('forwards a debounced change to subscribers with the changed path', () => {
    const fake = fakeWatch()
    const watcher = createNodeWatcher(['app'], { watch: fake.watch, ...immediate })
    const changes: string[] = []
    watcher.onChange((p) => changes.push(p))
    fake.fire[0]?.('change', 'app/index.tsx')
    expect(changes).toEqual(['app/index.tsx'])
  })

  it('coalesces a burst of events into one change (debounce)', () => {
    const fake = fakeWatch()
    // A manual timer: only the LAST scheduled callback survives (clear cancels prior).
    const timer: { fn: (() => void) | null } = { fn: null }
    const watcher = createNodeWatcher(['app'], {
      watch: fake.watch,
      setTimer: (fn) => {
        timer.fn = fn
        return 1
      },
      clearTimer: () => {
        timer.fn = null
      },
    })
    const changes: string[] = []
    watcher.onChange((p) => changes.push(p))
    fake.fire[0]?.('change', 'a.tsx')
    fake.fire[0]?.('change', 'b.tsx')
    fake.fire[0]?.('change', 'c.tsx')
    expect(changes).toEqual([]) // nothing fired yet — still debouncing
    timer.fn?.() // quiet period elapses
    expect(changes).toEqual(['c.tsx']) // one rebuild, for the latest path
  })

  it('unsubscribes and closes the underlying watches', () => {
    const fake = fakeWatch()
    const watcher = createNodeWatcher(['a', 'b'], { watch: fake.watch, ...immediate })
    const cb = vi.fn()
    const off = watcher.onChange(cb)
    off()
    fake.fire[0]?.('change', 'x')
    expect(cb).not.toHaveBeenCalled()
    watcher.close()
    expect(fake.closed).toEqual([true, true])
  })
})

describe('createDevServer', () => {
  it('serves index.html with the live-reload client injected before </body>', () => {
    const server = createDevServer()
    server.setFiles({ 'index.html': '<html><body><div id="app"></div></body></html>' })
    const res = server.handle('GET', '/')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toContain('<div id="app"></div>')
    expect(res.body).toContain('location.reload()') // live-reload client injected
    expect(res.body.indexOf('location.reload()')).toBeLessThan(res.body.indexOf('</body>'))
  })

  it('serves built JS assets, resolving extensionless relative imports (/App → App.js)', () => {
    const server = createDevServer()
    server.setFiles({
      'index.html': '<body></body>',
      'main.js': "import { App } from './App.js'",
      'App.js': 'export const App = () => null',
    })
    const js = server.handle('GET', '/main.js')
    expect(js.status).toBe(200)
    expect(js.headers['content-type']).toContain('application/javascript')
    expect(js.body).toContain("from './App.js'")
    // a browser request for the extensionless specifier resolves to the .js file
    const ext = server.handle('GET', '/App')
    expect(ext.status).toBe(200)
    expect(ext.body).toContain('export const App')
  })

  it('serves the build version and bumps it on rebuild (drives reload)', () => {
    const server = createDevServer()
    expect(server.handle('GET', '/__mindees/version').body).toBe('0')
    server.bump()
    server.bump()
    const res = server.handle('GET', '/__mindees/version')
    expect(res.body).toBe('2')
    expect(res.headers['cache-control']).toBe('no-store') // never cache the version probe
  })

  it('404s unknown paths and 405s non-GET', () => {
    const server = createDevServer()
    expect(server.handle('GET', '/nope.js').status).toBe(404)
    expect(server.handle('POST', '/').status).toBe(405)
  })

  it('shows a build-error overlay at / until the next successful build', () => {
    const server = createDevServer()
    server.setError(
      renderDevPage({
        ok: false,
        compiled: [],
        diagnostics: [{ severity: 'error', message: 'boom' }],
      }),
    )
    const fail = server.handle('GET', '/')
    expect(fail.body).toContain('build failed')
    expect(fail.body).toContain('location.reload()') // overlay still live-reloads → recovers automatically
    server.setFiles({ 'index.html': '<body>recovered</body>' }) // a good build clears the overlay
    expect(server.handle('GET', '/').body).toContain('recovered')
  })
})

describe('renderDevPage', () => {
  it('renders a build status page (ok and failed)', () => {
    const ok = renderDevPage({ ok: true, compiled: ['a.tsx', 'b.tsx'], diagnostics: [] })
    expect(ok).toContain('build ok')
    expect(ok).toContain('2 file(s)')
    const bad = renderDevPage({
      ok: false,
      compiled: [],
      diagnostics: [{ severity: 'error', message: 'boom <x>' }],
    })
    expect(bad).toContain('build failed')
    expect(bad).toContain('1 error')
    expect(bad).toContain('boom &lt;x&gt;') // escaped
  })

  it('embeds the current build version as the live-reload baseline (no missed reload)', () => {
    const server = createDevServer()
    server.setFiles({ 'index.html': '<body></body>' })
    server.bump() // version 1
    server.bump() // version 2
    const body = server.handle('GET', '/').body
    expect(body).toContain('var v="2"') // baseline = the version the page is served at, not null
    expect(body).not.toContain('var v=null')
  })
})
