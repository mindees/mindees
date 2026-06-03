import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts', './src/theme.ts'],
  format: 'esm',
  dts: true,
  platform: 'neutral',
  unbundle: true,
  sourcemap: true,
  clean: true,
})
