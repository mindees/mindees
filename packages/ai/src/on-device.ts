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

import { notImplemented } from '@mindees/core'
import type { AiBackend } from './contract'

/**
 * 🔬 Research track — not implemented. Returns an {@link AiBackend} whose `generate`
 * and `stream` throw {@link NotImplementedError}. Use a mock or server backend instead.
 *
 * @experimental
 */
export function createOnDeviceBackend(): AiBackend {
  return {
    generate() {
      return notImplemented('ai.onDevice.generate (native on-device LLM runtime)')
    },
    stream() {
      return notImplemented('ai.onDevice.stream (native on-device LLM runtime)')
    },
  }
}
