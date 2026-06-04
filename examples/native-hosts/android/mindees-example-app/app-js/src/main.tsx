/**
 * App entry. The whole native wiring — command backend, render, flush, the
 * `MindeesApp.start()/dispatchEvent()` contract the host calls — is handled by
 * `createNativeApp`. An app author writes only this.
 *
 * @module
 */

import { createNativeApp } from '@mindees/renderer'
import { App } from './App'

createNativeApp(<App />)
