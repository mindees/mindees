/**
 * **Pulse sandboxed WASM modules** (spec §10) — ship signed, capability-secure feature modules that
 * run at runtime, isolated in their own linear memory. A module gets ONLY the host capabilities you
 * pass it (the import object); it has no ambient access to the JS realm, the network, or the DOM — a
 * true capability sandbox. This is core WebAssembly (works on Hermes/RN, Node, and the web today);
 * the full WASM **Component Model** (WASI 0.2/0.3 typed interfaces) is a labeled follow-up that slots
 * in behind the same `instantiate` seam.
 *
 * @module
 */

import { UpdateError } from './errors'

// Self-contained typing for the JS-standard `WebAssembly` global. This package targets a neutral
// runtime (Hermes/RN, Node, web) WITHOUT the DOM lib, so we declare exactly the surface we use rather
// than pulling in `lib.dom`/`lib.webworker` (which would also leak `document`, `fetch`, etc.).
type WasmBytes = ArrayBuffer | ArrayBufferView
/** A module's exported linear memory. */
export interface WasmMemory {
  readonly buffer: ArrayBuffer
}
interface WasmInstance {
  readonly exports: Record<string, unknown>
}
interface WasmEngine {
  validate(bytes: WasmBytes): boolean
  instantiate(
    bytes: WasmBytes,
    imports?: Record<string, Record<string, unknown>>,
  ): Promise<{ instance: WasmInstance }>
  readonly Memory: new (descriptor: { initial: number }) => WasmMemory
}
declare const WebAssembly: WasmEngine

/** A host capability surface handed to a module: `{ "module": { "fn": (...) => ... } }`. */
export type Capabilities = Record<string, Record<string, (...args: never[]) => unknown>>

/** A live, sandboxed module instance. */
export interface WasmModuleInstance {
  /** The module's exports (functions, memory, globals). */
  readonly exports: Readonly<Record<string, unknown>>
  /** Call an exported function by name (throws `MODULE_INVALID` if it isn't an exported function). */
  call<R = unknown>(name: string, ...args: number[]): R
  /** The module's exported linear memory, if any. */
  readonly memory?: WasmMemory
}

/** Options for {@link createWasmModuleRuntime}. */
export interface WasmModuleRuntimeOptions {
  /** Reject modules larger than this many bytes (anti-bloat / anti-DoS). Default: 16 MiB. */
  readonly maxBytes?: number
}

/** The runtime that instantiates sandboxed WASM feature modules. */
export interface WasmModuleRuntime {
  /**
   * Instantiate `bytes` with EXACTLY the given `capabilities` as imports (nothing else is reachable).
   * Rejects (`MODULE_INVALID`) on a malformed/oversized module or a missing required import.
   */
  instantiate(bytes: WasmBytes, capabilities?: Capabilities): Promise<WasmModuleInstance>
}

const DEFAULT_MAX_BYTES = 16 * 1024 * 1024

/**
 * Create a sandboxed WASM module runtime. A module sees only the `capabilities` you pass to
 * `instantiate` — capability-secure by construction.
 */
export function createWasmModuleRuntime(options: WasmModuleRuntimeOptions = {}): WasmModuleRuntime {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  return {
    async instantiate(bytes, capabilities = {}) {
      const size = bytes.byteLength
      if (size > maxBytes) {
        throw new UpdateError(
          'MODULE_INVALID',
          `WASM module is ${size} B, over the ${maxBytes} B limit`,
        )
      }
      if (!WebAssembly.validate(bytes)) {
        throw new UpdateError(
          'MODULE_INVALID',
          'WASM module failed validation (malformed bytecode)',
        )
      }
      let instance: WasmInstance
      try {
        // The import object IS the sandbox: only `capabilities` is reachable from inside the module.
        const result = await WebAssembly.instantiate(bytes, capabilities)
        instance = result.instance
      } catch (error) {
        // A missing/typed-wrong import (LinkError) or a compile error → the module asked for a
        // capability it wasn't granted; refuse it deterministically.
        throw new UpdateError(
          'MODULE_INVALID',
          `WASM module could not be instantiated: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
      const exports = instance.exports as Record<string, unknown>
      const memory = exports.memory instanceof WebAssembly.Memory ? exports.memory : undefined
      const handle: WasmModuleInstance = {
        exports,
        call<R = unknown>(name: string, ...args: number[]): R {
          const fn = exports[name]
          if (typeof fn !== 'function') {
            throw new UpdateError(
              'MODULE_INVALID',
              `WASM module has no exported function "${name}"`,
            )
          }
          return (fn as (...a: number[]) => R)(...args)
        },
        // Only present when the module exports memory (exactOptionalPropertyTypes).
        ...(memory ? { memory } : {}),
      }
      return handle
    },
  }
}
