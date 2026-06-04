/**
 * The Synapse server/HTTP backend — a real {@link AiBackend} that talks to a hosted
 * model API over an **injected `fetch`** (capability injection, like Pulse's
 * `fetchManifest`). Provider-agnostic via a {@link ProviderMapper}; streaming via the
 * pure-TS {@link parseSse} parser → `AsyncIterable<AiChunk>` (no Web/Node streams in the
 * public surface). Exported from the `@mindees/ai/server` subpath. See
 * `docs/adr/0018-synapse-server-backend.md`.
 *
 * @module
 */

import type { AiBackend, AiChunk, AiResult, GenerateRequest } from './contract'
import { AiError } from './errors'
import { type AdapterName, MAPPERS, type ProviderMapper } from './mappers'
import { decodeChunks, parseSse } from './sse'

export {
  type AdapterName,
  anthropicMapper,
  openaiMapper,
  type ProviderMapper,
  type StreamParser,
} from './mappers'
export { decodeChunks, parseSse, type SseMessage } from './sse'

/** A minimal `Response` shape (no DOM lib). A real `Response` is structurally compatible. */
export interface ResponseLike {
  readonly ok: boolean
  readonly status: number
  json(): Promise<unknown>
  text(): Promise<string>
  readonly body?: AsyncIterable<Uint8Array> | null
}

/** A minimal request init (no DOM lib). */
export interface RequestInitLike {
  readonly method: string
  readonly headers: Record<string, string>
  readonly body: string
  readonly signal?: unknown
}

/** A minimal `fetch` (no DOM lib). The global `fetch` is structurally compatible. */
export type FetchLike = (url: string, init: RequestInitLike) => Promise<ResponseLike>

/** Options for {@link createServerBackend}. */
export interface ServerBackendOptions {
  /** Injected transport (the global `fetch`, or a fake in tests). */
  readonly fetch: FetchLike
  /** Base URL of the model API (no trailing slash). */
  readonly baseUrl: string
  /** Model id to request. */
  readonly model: string
  /** API key — sent as `Authorization: Bearer` (or Anthropic's `x-api-key`). */
  readonly apiKey?: string
  /** Provider adapter name or a custom {@link ProviderMapper}. Default `'openai'`. */
  readonly adapter?: AdapterName | ProviderMapper
  /** Extra headers merged over the defaults. */
  readonly headers?: Record<string, string>
}

/** Create a server/HTTP {@link AiBackend}. */
export function createServerBackend(options: ServerBackendOptions): AiBackend {
  const { baseUrl, model } = options
  const doFetch = options.fetch
  if (typeof doFetch !== 'function') {
    throw new AiError('NO_TRANSPORT', 'createServerBackend requires a `fetch`')
  }
  const mapper: ProviderMapper =
    typeof options.adapter === 'object' ? options.adapter : MAPPERS[options.adapter ?? 'openai']

  const buildHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...options.headers,
    }
    if (options.apiKey) {
      // Auth scheme follows the MAPPER (not the string-vs-object form the adapter was
      // supplied in), so `adapter: anthropicMapper` authenticates like `adapter: 'anthropic'`.
      if (mapper.auth === 'anthropic') {
        headers['x-api-key'] = options.apiKey
        headers['anthropic-version'] = '2023-06-01'
      } else {
        headers.authorization = `Bearer ${options.apiKey}`
      }
    }
    return headers
  }

  const send = async (request: GenerateRequest, stream: boolean): Promise<ResponseLike> => {
    if (request.signal?.aborted) throw new AiError('ABORTED', 'request aborted')
    const { path, body } = mapper.buildRequest(request, model, stream)
    const res = await doFetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
      signal: request.signal,
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new AiError('HTTP_STATUS', `model API returned ${res.status}: ${detail.slice(0, 200)}`)
    }
    return res
  }

  return {
    async generate(request): Promise<AiResult> {
      const res = await send(request, false)
      const json = await res.json()
      // Re-check after the round-trip: an abort during the fetch/parse must surface,
      // matching stream()'s and runTools' polling model (an injected fetch may ignore
      // the forwarded signal).
      if (request.signal?.aborted) throw new AiError('ABORTED', 'request aborted')
      return mapper.parseResponse(json)
    },

    async *stream(request): AsyncIterable<AiChunk> {
      const res = await send(request, true)
      if (!res.body) throw new AiError('STREAM_PARSE', 'streaming response has no body')
      const parseChunk = mapper.createStreamParser()
      for await (const message of parseSse(decodeChunks(res.body))) {
        // Terminal sentinel first: a completed stream must resolve normally even if the
        // signal flips on this exact iteration (no spurious ABORTED on a done stream).
        if (message.data.trim() === '[DONE]') return
        if (request.signal?.aborted) throw new AiError('ABORTED', 'request aborted')
        let parsed: unknown
        try {
          parsed = JSON.parse(message.data)
        } catch {
          throw new AiError('STREAM_PARSE', `malformed SSE data: ${message.data.slice(0, 80)}`)
        }
        for (const chunk of parseChunk(parsed)) yield chunk
      }
    },
  }
}
