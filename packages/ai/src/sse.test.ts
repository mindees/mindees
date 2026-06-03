import { describe, expect, it } from 'vitest'
import { AiError } from './errors'
import { decodeChunks, parseSse, type SseMessage } from './sse'

async function* strings(...chunks: string[]): AsyncIterable<string> {
  for (const c of chunks) yield c
}
async function* bytes(...chunks: string[]): AsyncIterable<Uint8Array> {
  const enc = new TextEncoder()
  for (const c of chunks) yield enc.encode(c)
}
async function collect(source: AsyncIterable<SseMessage>): Promise<string[]> {
  const out: string[] = []
  for await (const m of source) out.push(m.data)
  return out
}

describe('sse parser', () => {
  it('dispatches data events on blank lines, incl. the [DONE] sentinel', async () => {
    const data = await collect(parseSse(strings('data: a\n\ndata: b\n\ndata: [DONE]\n\n')))
    expect(data).toEqual(['a', 'b', '[DONE]'])
  })

  it('joins multi-line data fields with newlines', async () => {
    const data = await collect(parseSse(strings('data: line1\ndata: line2\n\n')))
    expect(data).toEqual(['line1\nline2'])
  })

  it('skips comments / keep-alives and handles CRLF', async () => {
    const data = await collect(parseSse(strings(': keep-alive\r\n\r\ndata: x\r\n\r\n')))
    expect(data).toEqual(['x'])
  })

  it('reassembles an event split across chunk boundaries', async () => {
    const data = await collect(parseSse(strings('data: {"a":', '1}', '\n\n')))
    expect(data).toEqual(['{"a":1}'])
  })

  it('flushes a final event with no trailing blank line', async () => {
    const data = await collect(parseSse(strings('data: tail')))
    expect(data).toEqual(['tail'])
  })

  it('decodeChunks turns bytes into strings (handles multi-byte split)', async () => {
    const data = await collect(parseSse(decodeChunks(bytes('data: hello\n\n'))))
    expect(data).toEqual(['hello'])
  })

  it('caps a single line that never sends a newline (no memory exhaustion)', async () => {
    const huge = 'x'.repeat(9 * 1024 * 1024) // > 8 MiB cap, no newline
    await expect(collect(parseSse(strings(huge)))).rejects.toBeInstanceOf(AiError)
  })

  it('caps an event whose data: lines accumulate without a blank-line terminator', async () => {
    // Endless newline-terminated data: lines with NO blank separator: `buffer` drains to
    // ~empty each line so the line cap never trips, but the joined event data must not grow
    // without bound. Nine 1 MiB data values (> 8 MiB) with no dispatch should throw.
    const line = `data: ${'x'.repeat(1024 * 1024)}\n`
    await expect(collect(parseSse(strings(line.repeat(9))))).rejects.toBeInstanceOf(AiError)
  })
})
