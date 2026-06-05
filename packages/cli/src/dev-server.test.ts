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
  it('serves the app HTML with the live-reload client injected before </body>', () => {
    const server = createDevServer({ html: '<html><body><div id="app"></div></body></html>' })
    const res = server.handle('GET', '/')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toContain('<div id="app"></div>')
    expect(res.body).toContain('location.reload()') // live-reload client injected
    expect(res.body.indexOf('location.reload()')).toBeLessThan(res.body.indexOf('</body>'))
  })

  it('serves the build version and bumps it on rebuild (drives reload)', () => {
    const server = createDevServer({ html: '<body></body>' })
    expect(server.handle('GET', '/__mindees/version').body).toBe('0')
    server.bump()
    server.bump()
    const res = server.handle('GET', '/__mindees/version')
    expect(res.body).toBe('2')
    expect(res.headers['cache-control']).toBe('no-store') // never cache the version probe
  })

  it('404s unknown paths and 405s non-GET', () => {
    const server = createDevServer({ html: '<body></body>' })
    expect(server.handle('GET', '/nope').status).toBe(404)
    expect(server.handle('POST', '/').status).toBe(405)
  })
})

describe('createDevServer.setHtml + renderDevPage', () => {
  it('serves updated HTML after setHtml (rebuild output changes)', () => {
    const server = createDevServer({ html: '<body>old</body>' })
    expect(server.handle('GET', '/').body).toContain('old')
    server.setHtml('<body>new</body>')
    const res = server.handle('GET', '/')
    expect(res.body).toContain('new')
    expect(res.body).not.toContain('old')
    expect(res.body).toContain('location.reload()') // client still injected after update
  })

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
})
