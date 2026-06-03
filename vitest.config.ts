import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    // Resolve workspace packages to their TypeScript SOURCE so tests run without
    // a prior build step. Folder name maps 1:1 to the scope suffix
    // (e.g. @mindees/core -> packages/core/src/index.ts).
    alias: [
      // Subpath exports (e.g. @mindees/ai/devtools) → packages/ai/src/devtools.ts. Must come
      // before the bare-package rule so the package name isn't treated as a folder.
      {
        find: /^@mindees\/([^/]+)\/(.+)$/,
        replacement: resolve(root, 'packages/$1/src/$2.ts'),
      },
      {
        find: /^@mindees\/([^/]+)$/,
        replacement: resolve(root, 'packages/$1/src/index.ts'),
      },
    ],
  },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
    // Several tests construct a real TypeScript program (the compiler gate, the
    // CLI build/dev orchestrator) which loads lib `.d.ts` files — ~1.5-2.5s each
    // and slower under full-suite CPU contention. The default 5s timeout flakes
    // on loaded / 2-core CI runners, so give generous headroom. The tests are
    // fast in isolation; this only guards against contention, it never hangs.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/dist/**', '**/*.config.ts'],
    },
  },
})
