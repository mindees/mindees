/**
 * `mindees dev` transport — the live-reload layer over the tested {@link "./dev".startDev}
 * orchestrator. Two small, dependency-injected (therefore testable) pieces:
 *
 * - {@link createNodeWatcher} adapts `node:fs.watch` to the {@link "./dev".Watcher} interface,
 *   debounced so an editor's multi-event save triggers ONE rebuild.
 * - {@link createDevServer} is a pure request handler that serves the app HTML (with a tiny
 *   live-reload client injected) and a version endpoint the client polls; `bump()` on each rebuild
 *   makes connected browsers reload.
 *
 * The actual `http.createServer` + `fs.watch` instantiation is the thin glue in `bin.ts`; the
 * behavior proven here (debounced change → rebuild → version bump → reload) is the substance.
 *
 * @module
 */

import type { Watcher } from './dev'

/** A handle to an active filesystem watch (the `node:fs.watch` `FSWatcher` shape we use). */
export interface WatchHandle {
  close(): void
}

/** The `node:fs.watch` signature (injected so the watcher is testable without a real filesystem). */
export type WatchFn = (
  path: string,
  options: { recursive?: boolean },
  listener: (event: string, filename: string | null) => void,
) => WatchHandle

/** Options for {@link createNodeWatcher}. */
export interface NodeWatcherOptions {
  /** The watch implementation — `node:fs.watch` in `bin`, a fake in tests. */
  readonly watch: WatchFn
  /** Coalesce a burst of events into one change after this quiet period (ms, default 50). */
  readonly debounceMs?: number
  /** Schedule a debounce timer (default `setTimeout`); injectable for tests. */
  readonly setTimer?: (fn: () => void, ms: number) => unknown
  /** Cancel a debounce timer (default `clearTimeout`); injectable for tests. */
  readonly clearTimer?: (handle: unknown) => void
}

/** A {@link Watcher} (plus `close()`) backed by `node:fs.watch`, debounced. */
export function createNodeWatcher(
  paths: readonly string[],
  options: NodeWatcherOptions,
): Watcher & { close(): void } {
  const debounceMs = options.debounceMs ?? 50
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const listeners = new Set<(changedPath: string) => void>()
  let timer: unknown = null
  let pending = ''

  const handles = paths.map((path) =>
    options.watch(path, { recursive: true }, (_event, filename) => {
      pending = filename ?? path
      if (timer !== null) clearTimer(timer)
      timer = setTimer(() => {
        timer = null
        const changed = pending
        for (const listener of listeners) listener(changed)
      }, debounceMs)
    }),
  )

  return {
    onChange(listener): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close(): void {
      if (timer !== null) clearTimer(timer)
      for (const handle of handles) handle.close()
      listeners.clear()
    },
  }
}

/** A minimal HTTP response the `bin` glue writes to the socket. */
export interface DevServerResponse {
  readonly status: number
  readonly headers: Record<string, string>
  readonly body: string
}

/** Options for {@link createDevServer}. */
export interface DevServerOptions {
  /** The app HTML to serve at `/` (the live-reload client is injected automatically). */
  readonly html: string
  /** Path the live-reload client polls for the build version (default `/__mindees/version`). */
  readonly reloadPath?: string
  /** Poll interval the injected client uses, in ms (default 1000). */
  readonly pollMs?: number
}

/** A pure dev-server: a request handler + a `bump()` that makes polling browsers reload. */
export interface DevServer {
  /** Handle a request → a response (pure given the current html + version). */
  handle(method: string, url: string): DevServerResponse
  /** Replace the served app HTML (call after a rebuild changes the output). */
  setHtml(html: string): void
  /** Bump the build version (call after each rebuild) so connected clients reload. */
  bump(): void
  /** The current build version. */
  version(): number
}

const LIVE_RELOAD = (reloadPath: string, pollMs: number): string =>
  `<script>(function(){var v=null;setInterval(function(){fetch(${JSON.stringify(reloadPath)}).then(function(r){return r.text()}).then(function(t){if(v===null){v=t}else if(t!==v){location.reload()}}).catch(function(){})},${pollMs})})()</script>`

/** Create a live-reload {@link DevServer}. The handler serves the app HTML + a version endpoint. */
export function createDevServer(options: DevServerOptions): DevServer {
  const reloadPath = options.reloadPath ?? '/__mindees/version'
  const pollMs = options.pollMs ?? 1000
  const client = LIVE_RELOAD(reloadPath, pollMs)
  let version = 0
  let html = options.html

  // Inject the live-reload client just before </body> (or append if there's no body tag).
  const withClient = (h: string): string =>
    h.includes('</body>') ? h.replace('</body>', `${client}</body>`) : h + client

  return {
    version: () => version,
    setHtml(next): void {
      html = next
    },
    bump(): void {
      version += 1
    },
    handle(method, url): DevServerResponse {
      if (method !== 'GET') {
        return { status: 405, headers: { allow: 'GET' }, body: 'Method Not Allowed' }
      }
      const path = url.split('?', 1)[0]
      if (path === '/' || path === '/index.html') {
        return {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
          body: withClient(html),
        }
      }
      if (path === reloadPath) {
        return {
          status: 200,
          headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' },
          body: String(version),
        }
      }
      return { status: 404, headers: { 'content-type': 'text/plain' }, body: 'Not Found' }
    },
  }
}

/** A build-status result shape (a subset of the CLI `BuildResult`) for {@link renderDevPage}. */
export interface DevBuildStatus {
  readonly ok: boolean
  readonly compiled: readonly string[]
  readonly diagnostics: ReadonlyArray<{ readonly severity: string; readonly message: string }>
}

/** Render a minimal dev status page for a build result (preview shell; live-reload is injected by the server). */
export function renderDevPage(status: DevBuildStatus): string {
  const esc = (s: string): string =>
    s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
  const errors = status.diagnostics.filter((d) => d.severity === 'error')
  const banner = status.ok
    ? `<p style="color:#16a34a">✓ build ok — ${status.compiled.length} file(s) compiled</p>`
    : `<p style="color:#dc2626">✗ build failed — ${errors.length} error(s)</p>`
  const list = status.diagnostics
    .map((d) => `<li><strong>${esc(d.severity)}</strong>: ${esc(d.message)}</li>`)
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>MindeesNative dev</title></head><body><h1>MindeesNative — dev preview</h1>${banner}${list ? `<ul>${list}</ul>` : ''}</body></html>`
}
