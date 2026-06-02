/**
 * Native + GPU-canvas backends — 🔬 **research tracks**.
 *
 * These define the *contracts* so the Helix architecture is real and the public
 * API is honest, but they are **not implemented**. The constructors throw
 * {@link NotImplementedError}. The web/DOM backend ({@link createDomBackend}) and
 * the headless backend are the working targets today; the reference platform is
 * the web (per ROADMAP Phase 3).
 *
 * - **Native strand** (`NativeBackend`): real UIKit/SwiftUI (iOS) and Jetpack
 *   Compose (Android) host nodes. Implementing this is how MindeesNative gets
 *   true native UI that adopts new OS design languages automatically.
 * - **GPU canvas strand** (`CanvasBackend`): a wgpu/WebGPU surface with
 *   build-time-precompiled shaders, for pixel-perfect custom UI composited next
 *   to native nodes.
 *
 * Both are tracked for later phases. See ROADMAP.md and the framework spec.
 *
 * @module
 */

import { NotImplementedError } from '@mindees/core'
import type { HostBackend } from './backend'

/**
 * 🔬 Research track. The native (iOS/Android) host backend. Extends the same
 * {@link HostBackend} contract the reconciler already speaks, so when it lands,
 * `render()` works against native views with no reconciler changes.
 */
export interface NativeBackend<N> extends HostBackend<N> {
  /** The target platform this backend drives. */
  readonly platform: 'ios' | 'android'
}

/**
 * 🔬 Research track. A GPU-canvas backend (wgpu/WebGPU) for pixel-perfect custom
 * UI. Composes with the native strand: a canvas subtree renders to a GPU surface
 * embedded among native host nodes.
 */
export interface CanvasBackend<N> extends HostBackend<N> {
  /** Marks this backend as drawing to a GPU canvas surface. */
  readonly surface: 'gpu-canvas'
}

/**
 * 🔬 Research track — not implemented. Throws {@link NotImplementedError}.
 * Use {@link createDomBackend} (web) today.
 *
 * @experimental
 */
export function createNativeBackend(_platform: 'ios' | 'android'): never {
  throw new NotImplementedError('Native (iOS/Android) renderer backend')
}

/**
 * 🔬 Research track — not implemented. Throws {@link NotImplementedError}.
 *
 * @experimental
 */
export function createCanvasBackend(): never {
  throw new NotImplementedError('GPU canvas renderer backend (wgpu/WebGPU)')
}
