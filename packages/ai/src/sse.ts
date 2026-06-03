/**
 * A tiny, hand-rolled Server-Sent Events parser (no `eventsource` dep) for the server
 * backend's streaming responses. Pure-TS: buffers across chunk boundaries, joins
 * multi-line `data:` fields, skips `:` comments / keep-alives, and is driven by an
 * `AsyncIterable<string>` so it's golden-fixture-testable with zero network. See
 * `docs/adr/0018-synapse-server-backend.md`.
 *
 * @module
 */

import { AiError } from './errors'

/**
 * Cap on un-dispatched parser state (chars, not bytes — we measure post-decode string
 * length). Bounds BOTH a single line that never gets a newline AND an event whose `data:`
 * lines accumulate without a blank-line terminator, so a hostile/buggy server can't
 * exhaust memory (or stall the mid-stream abort) by streaming endless data with no event
 * boundary.
 */
const MAX_SSE_BUFFER = 8 * 1024 * 1024

/** One dispatched SSE event. */
export interface SseMessage {
  /** The joined `data:` payload. */
  readonly data: string
  /** The `event:` type, if any. */
  readonly event: string | undefined
}

/** Parse an SSE byte/string stream into dispatched {@link SseMessage}s. */
export async function* parseSse(chunks: AsyncIterable<string>): AsyncIterable<SseMessage> {
  let buffer = ''
  let dataLines: string[] = []
  let dataSize = 0 // chars accumulated in dataLines since the last dispatch
  let event: string | undefined

  const dispatch = (): SseMessage | undefined => {
    if (dataLines.length === 0) {
      event = undefined
      return undefined
    }
    const message: SseMessage = { data: dataLines.join('\n'), event }
    dataLines = []
    dataSize = 0
    event = undefined
    return message
  }

  const feedLine = (raw: string): void => {
    // Strip a trailing CR so CRLF and LF both work.
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (line.startsWith(':')) return // comment / keep-alive
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'data') {
      dataLines.push(value)
      dataSize += value.length
    } else if (field === 'event') event = value
  }

  for await (const chunk of chunks) {
    buffer += chunk
    let newline = buffer.indexOf('\n')
    while (newline !== -1) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (line === '' || line === '\r') {
        const message = dispatch()
        if (message) yield message
      } else {
        feedLine(line)
      }
      // Catch an event whose data lines grow without a blank-line terminator.
      if (dataSize > MAX_SSE_BUFFER) {
        throw new AiError(
          'STREAM_PARSE',
          `SSE event exceeded ${MAX_SSE_BUFFER} chars without a blank-line terminator`,
        )
      }
      newline = buffer.indexOf('\n')
    }
    // Catch a single line that never receives a newline.
    if (buffer.length > MAX_SSE_BUFFER) {
      throw new AiError(
        'STREAM_PARSE',
        `SSE line exceeded ${MAX_SSE_BUFFER} chars without a newline`,
      )
    }
  }
  // Process a trailing line with no newline, then flush a final event.
  if (buffer !== '') feedLine(buffer)
  const tail = dispatch()
  if (tail) yield tail
}

/** Adapt a byte stream (e.g. `response.body`) to the string chunks {@link parseSse} expects. */
export async function* decodeChunks(bytes: AsyncIterable<Uint8Array>): AsyncIterable<string> {
  const decoder = new TextDecoder()
  for await (const chunk of bytes) yield decoder.decode(chunk, { stream: true })
  const tail = decoder.decode()
  if (tail) yield tail
}
