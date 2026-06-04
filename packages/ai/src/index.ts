/**
 * `@mindees/ai` (Synapse) — provider-agnostic AI + dev-time intelligence.
 *
 * Phase 11 ships the **contract** ({@link createAi}, {@link AiBackend}, messages,
 * {@link GenerateRequest}/{@link AiResult}/{@link AiChunk}, {@link AiError}) with
 * streaming as `AsyncIterable` only (Node/browser/Hermes-safe), a deterministic
 * {@link createMockBackend mock backend} (the working, offline, no-keys fallback),
 * Standard-Schema structured output, bounded tool calling, an inject-`fetch` server
 * backend on the `@mindees/ai/server` subpath, and a dev-time error explainer on the
 * `@mindees/ai/devtools` subpath. The {@link createOnDeviceBackend on-device seam}
 * throws because on-device LLM inference is inherently native and stays a 🔬 research
 * track.
 *
 * @module
 */

import type { Maturity, PackageInfo } from '@mindees/core'
import { NotImplementedError, notImplemented } from '@mindees/core'

/** The npm package name. */
export const name = '@mindees/ai'

/** The package version. All `@mindees/*` packages share one locked version line. */
export const VERSION = '0.0.0'

/** Current maturity of this package. See the repository `STATUS.md`. */
export const maturity: Maturity = 'experimental'

/** Static identity + maturity metadata for this package. */
export const info: PackageInfo = { name, version: VERSION, maturity }

export {
  type AbortLike,
  type Ai,
  type AiBackend,
  type AiChunk,
  type AiResult,
  createAi,
  type FinishReason,
  type GenerateRequest,
  type Message,
  messageText,
  type Part,
  type Role,
  type TextPart,
  type ToolCallPart,
  type ToolDefinition,
  type ToolResultPart,
  type Usage,
} from './contract'
export { AiError, type AiErrorCode, type AiErrorOptions } from './errors'
export {
  containsForbiddenKey,
  DEFAULT_MAX_INPUT_CHARS,
  type ExtractResult,
  extractJson,
  formatIssues,
  lenientParseJson,
  type SanitizeLimits,
  sanitizeJson,
  type ValidationOutcome,
  validateStandard,
} from './json'
export {
  createMockBackend,
  type MockBackendOptions,
  type MockReply,
  type MockResponse,
} from './mock'
export {
  type GenerateObjectOptions,
  type GenerateObjectResult,
  type GeneratingBackend,
  generateObject,
  type StreamingBackend,
  type StreamObjectChunk,
  type StreamObjectOptions,
  streamObject,
} from './object'
export { createOnDeviceBackend } from './on-device'
export type { StandardSchemaV1 } from './standard-schema'
export {
  type RunToolsOptions,
  type RunToolsResult,
  runTools,
  type Tool,
  type ToolContext,
} from './tools'

export type { Maturity, PackageInfo }
export { NotImplementedError, notImplemented }
