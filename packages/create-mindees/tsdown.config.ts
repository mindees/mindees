import { defineConfig } from 'tsdown'

export default defineConfig({
  // Two entries: the library API (index) and the `create-mindees` executable (bin).
  entry: ['./src/index.ts', './src/bin.ts'],
  format: 'esm',
  dts: true,
  platform: 'neutral',
  unbundle: true,
  sourcemap: true,
  clean: true,
})
