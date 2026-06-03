import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts', './src/server.ts', './src/sdui.ts'],
  format: 'esm',
  dts: true,
  platform: 'neutral',
  unbundle: true,
  sourcemap: true,
  clean: true,
})
