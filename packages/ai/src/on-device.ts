/**
 * 🔬 Research track — the on-device AI backend seam. Every on-device LLM runtime is
 * inherently native (Apple Foundation Models, Android AICore/Gemini Nano, ExecuTorch,
 * llama.rn) or web-only (WebGPU/WASM), so none runs on the pure-TS Hermes/RN device
 * path. This backend implements the **same** {@link AiBackend} interface but throws
 * {@link NotImplementedError}, so a native runtime drops in later non-breakingly. The
 * working path today is the mock / server backends. See
 * `docs/adr/0017-synapse-ai-contract.md`.
 *
 * @module
 */

import { NotImplementedError } from '@mindees/core'
import type { AiBackend, AiChunk } from './contract'

/**
 * 🔬 Research track — not implemented. Returns an {@link AiBackend} whose `generate`
 * **rejects** and whose `stream` **throws on iteration** with a {@link NotImplementedError}.
 *
 * It does NOT throw synchronously from the method call: the contract is `generate(): Promise`
 * and `stream(): AsyncIterable`, so a caller's `await backend.generate(...)` / `for await` is
 * what surfaces the error — the same shape a future native runtime will have. Use a mock or
 * server backend for the working path.
 *
 * @experimental
 */
export function createOnDeviceBackend(): AiBackend {
  return {
    generate() {
      return Promise.reject(
        new NotImplementedError('ai.onDevice.generate (native on-device LLM runtime)'),
      )
    },
    stream(): AsyncIterable<AiChunk> {
      return {
        // biome-ignore lint/correctness/useYield: the iterator throws before it can yield.
        async *[Symbol.asyncIterator](): AsyncIterator<AiChunk> {
          throw new NotImplementedError('ai.onDevice.stream (native on-device LLM runtime)')
        },
      }
    },
  }
}
