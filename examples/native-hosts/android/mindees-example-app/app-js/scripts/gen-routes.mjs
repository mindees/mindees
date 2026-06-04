/**
 * File-based-routing codegen for the example. Scans `src/app/` and writes
 * `src/routes.gen.ts` — a static-import module map the app feeds to
 * `createFileRouter`. This is what makes routing truly drop-a-file on the native
 * (QuickJS) bundle, which has no `import.meta.glob`.
 *
 * Run by `pnpm run build:android-example-js` before bundling. The reusable codegen
 * lives in `@mindees/compiler` (`generateRouteModule`); this script just supplies the
 * file list. `routes.gen.ts` is generated (git-ignored) — never edit it by hand.
 */

import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const appDir = join(here, '..', 'src', 'app')
const outFile = join(here, '..', 'src', 'routes.gen.ts')
// app-js/scripts → repo root is six levels up.
const repoRoot = resolve(here, '..', '..', '..', '..', '..', '..')

const { generateRouteModule } = await import(
  pathToFileURL(join(repoRoot, 'packages', 'compiler', 'dist', 'routes.js')).href
)

/** Collect route files (relative, POSIX), skipping tests. */
function collect(dir, base = '') {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const rel = base ? `${base}/${name}` : name
    if (statSync(full).isDirectory()) out.push(...collect(full, rel))
    else if (/\.(tsx|ts|jsx|js)$/.test(name) && !/\.test\./.test(name)) out.push(rel)
  }
  return out
}

const files = collect(appDir)
writeFileSync(outFile, generateRouteModule(files, { importBase: './app' }))
process.stdout.write(`gen-routes: wrote ${files.length} route(s) to src/routes.gen.ts\n`)
