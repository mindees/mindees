import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts', './src/list.ts', './src/for.ts', './src/stack.ts', './src/tab.ts'],
  format: 'esm',
  dts: true,
  platform: 'neutral',
  unbundle: true,
  sourcemap: true,
  clean: true,
})
