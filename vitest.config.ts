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
      {
        find: /^@mindees\/(.*)$/,
        replacement: resolve(root, 'packages/$1/src/index.ts'),
      },
    ],
  },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/dist/**', '**/*.config.ts'],
    },
  },
})
