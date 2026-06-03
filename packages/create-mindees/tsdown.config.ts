import { defineConfig } from 'tsdown'

export default defineConfig({
  // Two entries: the library API (index) and the `create-mindees` executable (bin).
  // The bin adapter runs on Node; keep node:* imports external without emitting
  // unresolved-import warnings during the neutral package build.
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
