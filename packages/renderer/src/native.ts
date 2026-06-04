/**
 * Native rendering backends.
 *
 * Two layers live here, at different maturities:
 *
 * - ✅ **Native command backend** ({@link createNativeCommandBackend},
 *   re-exported below) — **implemented today**. It turns the Helix element tree +
 *   fine-grained reactive updates into a serializable {@link NativeCommand}
 *   stream that a native host can replay. This is the Phase 8A foundation for
 *   native rendering; it does not itself draw to the screen.
 * - 🔬 **Direct runtime backends** ({@link createNativeBackend},
 *   {@link createCanvasBackend}) — **research tracks**. They define the contracts
 *   so the Helix architecture is real and the public API is honest, but they are
 *   **not implemented**: the constructors throw {@link NotImplementedError}.
 *
 * The web/DOM backend ({@link createDomBackend}), the headless backend, the native
 * command backend, and the strict reference host are the fully working render targets
 * and protocol validation path today. The iOS/UIKit and Android View host projects in
 * `examples/native-hosts/` compile and render the command stream in CI.
 *
 * - **Native strand** (`NativeBackend`): a direct runtime backend that will connect
 *   a running JS app to real platform views. The command protocol and reference host
 *   projects exist today; the full app bridge/embedded JS engine remains future work.
 * - **GPU canvas strand** (`CanvasBackend`): a wgpu/WebGPU surface with
 *   build-time-precompiled shaders, for pixel-perfect custom UI composited next
 *   to native nodes.
 *
 * See ROADMAP.md and STATUS.md for the honest maturity breakdown.
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
 * 🔬 Research track — a direct iOS/Android runtime backend that draws platform views.
 * **Not implemented**: throws {@link NotImplementedError}.
 *
 * Today, drive {@link createNativeCommandBackend} to produce the native command
 * stream consumed by the verified host projects in `examples/native-hosts/`, or
 * {@link createDomBackend} for the web.
 *
 * @experimental
 */
export function createNativeBackend(_platform: 'ios' | 'android'): never {
  throw new NotImplementedError('Native (iOS/Android) platform host backend')
}

/**
 * 🔬 Research track — not implemented. Throws {@link NotImplementedError}.
 *
 * @experimental
 */
export function createCanvasBackend(): never {
  throw new NotImplementedError('GPU canvas renderer backend (wgpu/WebGPU)')
}

/**
 * ✅ The implemented native MVP: a backend that emits a serializable
 * {@link NativeCommand} stream for a native host to replay. See
 * {@link import('./native-command-backend').createNativeCommandBackend}.
 */
export {
  createNativeCommandBackend,
  type NativeCommandBackend,
  type NativeCommandBackendOptions,
  type NativeCommandNode,
} from './native-command-backend'
