import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

// Absolute paths so the bundle builds correctly regardless of the invoking cwd.
const here = dirname(fileURLToPath(import.meta.url))
// app-js is 5 levels below the repo root.
const repoRoot = resolve(here, '..', '..', '..', '..', '..')
const dist = (pkg: string) => resolve(repoRoot, 'packages', pkg, 'dist', 'index.js')

/**
 * Bundles the real Atlas + Helix app (src/main.ts) into a single QuickJS-safe IIFE
 * the Android example loads from assets. `@mindees/*` are inlined (the framework has
 * no runtime deps), the engine target is conservative, and a banner polyfills
 * `queueMicrotask` (some embedded engines lack it) before any module initializes.
 */
export default defineConfig({
  entry: [resolve(here, 'src/main.ts')],
  outDir: resolve(here, '..', 'src', 'main', 'assets'),
  format: ['iife'],
  globalName: 'MindeesAppBundle',
  // `node` so package `exports`/`main` resolve (the framework has no node builtins,
  // so nothing platform-specific leaks into the QuickJS-targeted output).
  platform: 'node',
  target: 'es2020',
  dts: false,
  clean: false,
  minify: false,
  // Resolve the framework packages straight to their built ESM dist (app-js isn't a
  // workspace member, so bare-specifier resolution can't find them); everything is
  // then inlined into the IIFE.
  alias: {
    '@mindees/core': dist('core'),
    '@mindees/atlas': dist('atlas'),
    '@mindees/renderer': dist('renderer'),
    '@mindees/router': dist('router'),
  },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  outputOptions: {
    entryFileNames: 'mindees-app.bundle.js',
    banner:
      "if (typeof globalThis !== 'undefined' && typeof globalThis.queueMicrotask !== 'function') { globalThis.queueMicrotask = function (cb) { Promise.resolve().then(cb); }; }",
  },
})
