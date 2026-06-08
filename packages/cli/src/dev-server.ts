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
  /** Path the live-reload client polls for the build version (default `/__mindees/version`). */
  readonly reloadPath?: string
  /** Poll interval the injected client uses, in ms (default 1000). */
  readonly pollMs?: number
}

/** A pure dev-server: serves the built app file tree (+ injected live-reload) and a version endpoint. */
export interface DevServer {
  /** Handle a request → a response (pure given the current files + error + version). */
  handle(method: string, url: string): DevServerResponse
  /** Replace the served build output (relative paths → contents, e.g. `index.html`, `main.js`). Clears any error. */
  setFiles(files: Record<string, string> | Map<string, string>): void
  /** Show a build-error overlay at `/` until the next {@link setFiles} (pass `null` to clear). */
  setError(html: string | null): void
  /** Bump the build version (call after each rebuild) so connected clients reload. */
  bump(): void
  /** The current build version. */
  version(): number
}

const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  css: 'text/css; charset=utf-8',
}
function contentTypeFor(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  return CONTENT_TYPES[ext] ?? 'text/plain; charset=utf-8'
}

const LIVE_RELOAD = (reloadPath: string, pollMs: number, version: number): string =>
  `<script>(function(){var v=${JSON.stringify(String(version))};setInterval(function(){fetch(${JSON.stringify(reloadPath)}).then(function(r){return r.text()}).then(function(t){if(t!==v){location.reload()}}).catch(function(){})},${pollMs})})()</script>`

/**
 * Create a live-reload {@link DevServer}. Serves the built file tree as native ES modules — `index.html`
 * at `/` (live-reload client injected), each emitted asset at its path, with extensionless resolution
 * (`/App` → `App.js`) so the compiled output's relative imports load. A failed build shows an error
 * overlay at `/` until the next successful build.
 */
export function createDevServer(options: DevServerOptions = {}): DevServer {
  const reloadPath = options.reloadPath ?? '/__mindees/version'
  const pollMs = options.pollMs ?? 1000
  let version = 0
  let files = new Map<string, string>()
  let errorPage: string | null = null

  // Inject the live-reload client just before </body> (or append if there's no body tag). Built
  // PER-REQUEST with the CURRENT version as the client's baseline — so a rebuild that lands within the
  // first poll window still differs from the served page and triggers a reload (no missed reloads).
  const withClient = (h: string): string => {
    const client = LIVE_RELOAD(reloadPath, pollMs, version)
    return h.includes('</body>') ? h.replace('</body>', `${client}</body>`) : h + client
  }
  const htmlResponse = (body: string): DevServerResponse => ({
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: withClient(body),
  })

  return {
    version: () => version,
    setFiles(next): void {
      files = next instanceof Map ? new Map(next) : new Map(Object.entries(next))
      errorPage = null // a successful build clears any prior error overlay
    },
    setError(html): void {
      errorPage = html
    },
    bump(): void {
      version += 1
    },
    handle(method, url): DevServerResponse {
      if (method !== 'GET') {
        return { status: 405, headers: { allow: 'GET' }, body: 'Method Not Allowed' }
      }
      const urlPath = url.split('?', 1)[0] ?? '/'
      if (urlPath === reloadPath) {
        return {
          status: 200,
          headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' },
          body: String(version),
        }
      }
      const rel = urlPath.replace(/^\/+/, '')
      if (rel === '' || rel === 'index.html') {
        if (errorPage !== null) return htmlResponse(errorPage)
        const shell = files.get('index.html')
        return htmlResponse(
          shell ?? '<!doctype html><body>MindeesNative dev — no build output yet.</body>',
        )
      }
      // Asset: exact match, then extensionless (`/App` → `App.js`) for native-ESM relative imports.
      const exact = files.get(rel)
      const served = exact !== undefined ? rel : files.has(`${rel}.js`) ? `${rel}.js` : null
      if (served !== null) {
        return {
          status: 200,
          headers: { 'content-type': contentTypeFor(served) },
          body: files.get(served) as string,
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
