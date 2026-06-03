import { defineConfig } from 'tsdown'

export default defineConfig({
  // Two entries: the library API (index) and the `mindees` executable (bin).
  // platform:'neutral' keeps the `.js`/`.d.ts` output extensions that the
  // package.json exports/bin map expects. The Node builtins used by the bin
  // adapter are explicitly external so the build output stays quiet.
  entry: ['./src/index.ts', './src/bin.ts'],
  format: 'esm',
  dts: true,
  platform: 'neutral',
  deps: {
    neverBundle: [/^node:/],
  },
  unbundle: true,
  sourcemap: true,
  clean: true,
})
