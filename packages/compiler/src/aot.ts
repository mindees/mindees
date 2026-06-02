/**
 * TypeScript → native machine code (AOT) — 🔬 **research track**.
 *
 * The framework spec's north star is compiling typed TS to native (ARM64/x86-64)
 * for native-grade throughput (à la Static Hermes / Valdi's TS→native pipeline).
 * That is **not implemented**: it's at the frontier and unproven across the full
 * dynamic-TS surface.
 *
 * Per the Working-Code Doctrine, this module is honest about that. The **working
 * fallback is the standard {@link compile} path** (TS → optimized JavaScript),
 * which runs everywhere today. {@link compileToNative} throws
 * {@link NotImplementedError} so nothing silently pretends to emit native code.
 *
 * @module
 */

import { NotImplementedError } from '@mindees/core'

/** Target architecture for a future native AOT backend. */
export type NativeTarget = 'arm64' | 'x86-64'

/**
 * 🔬 Research track — not implemented. Throws {@link NotImplementedError}.
 *
 * Use {@link compile} (TS → optimized JS) today; that is the working path and
 * the documented fallback for any code that can't (yet) be AOT-compiled.
 *
 * @experimental
 */
export function compileToNative(_source: string, _target: NativeTarget): never {
  throw new NotImplementedError('TypeScript → native machine code (AOT)')
}
