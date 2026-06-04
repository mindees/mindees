/**
 * App entry. The whole native wiring — command backend, render, flush, the
 * `MindeesApp.start()/dispatchEvent()` contract the host calls — is handled by
 * `createNativeApp`. An app author writes only this.
 *
 * @module
 */

import { setEnvironment } from '@mindees/atlas'
import { createNativeApp } from '@mindees/renderer'
import { App } from './App'

// The host injects the platform environment (window size, color scheme) before this
// bundle evaluates; apply it so the device hooks (useWindowDimensions/useColorScheme)
// read real values from the first render.
const envHost = (globalThis as { MindeesEnv?: { get(): string } }).MindeesEnv
if (envHost) {
  try {
    setEnvironment(JSON.parse(envHost.get()))
  } catch {
    // No/!invalid environment — hooks fall back to defaults.
  }
}

createNativeApp(<App />)
