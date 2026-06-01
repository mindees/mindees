import { defineConfig } from 'tsdown'

export default defineConfig({
  // Two entries: the library API (index) and the `mindees` executable (bin).
  // platform:'neutral' keeps the `.js`/`.d.ts` output extensions that the
  // package.json exports/bin map expects (node: builtins in bin.ts stay external
  // and resolve fine on Node at runtime).
  entry: ['./src/index.ts', './src/bin.ts'],
  format: 'esm',
  dts: true,
  platform: 'neutral',
  unbundle: true,
  sourcemap: true,
  clean: true,
})
