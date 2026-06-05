import { describe, expect, it } from 'vitest'
import { type AiChunk, createAi, type Message, messageText } from './contract'
import { AiError } from './errors'
import { NotImplementedError } from './index'
import { createMockBackend } from './mock'
import { createOnDeviceBackend } from './on-device'

async function collect(stream: AsyncIterable<AiChunk>): Promise<AiChunk[]> {
  const out: AiChunk[] = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

describe('contract — messageText', () => {
  it('flattens string and part content', () => {
    expect(messageText({ role: 'user', content: 'hi' })).toBe('hi')
    const m: Message = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'a' },
        { type: 'tool-call', id: '1', name: 't', args: {} },
        { type: 'text', text: 'b' },
      ],
    }
    expect(messageText(m)).toBe('ab') // non-text parts ignored
  })
})

describe('mock backend — generate', () => {
  it('returns a fixed reply', async () => {
    const ai = createAi({ backend: createMockBackend({ reply: 'hello world' }) })
    const result = await ai.generate({ messages: [{ role: 'user', content: 'hi' }] })
    expect(result.text).toBe('hello world')
    expect(result.finishReason).toBe('stop')
    expect(result.usage?.outputTokens).toBe('hello world'.length)
  })

  it('plays a script across successive calls (last repeats)', async () => {
    const ai = createAi({ backend: createMockBackend({ script: ['one', 'two'] }) })
    expect((await ai.generate({ messages: [] })).text).toBe('one')
    expect((await ai.generate({ messages: [] })).text).toBe('two')
    expect((await ai.generate({ messages: [] })).text).toBe('two') // exhausted → repeat last
  })

  it('throws AiError(ABORTED) when the signal is already aborted', async () => {
    const ai = createAi({ backend: createMockBackend({ reply: 'x' }) })
    await expect(ai.generate({ messages: [], signal: { aborted: true } })).rejects.toBeInstanceOf(
      AiError,
    )
  })
})

describe('mock backend — stream', () => {
  it('chunks the reply into text-deltas then a finish chunk', async () => {
    const ai = createAi({ backend: createMockBackend({ reply: 'abcdef', chunkSize: 2 }) })
    const chunks = await collect(ai.stream({ messages: [] }))
    expect(chunks).toEqual([
      { type: 'text-delta', delta: 'ab' },
      { type: 'text-delta', delta: 'cd' },
      { type: 'text-delta', delta: 'ef' },
      { type: 'finish', finishReason: 'stop', usage: { outputTokens: 6 } },
    ])
    // reassembling the deltas yields the full text
    const text = chunks
      .filter((c): c is Extract<AiChunk, { type: 'text-delta' }> => c.type === 'text-delta')
      .map((c) => c.delta)
      .join('')
    expect(text).toBe('abcdef')
  })

  it('honors mid-stream cancellation', async () => {
    const signal = { aborted: false }
    const ai = createAi({ backend: createMockBackend({ reply: 'abcdefghij', chunkSize: 2 }) })
    const iterator = ai.stream({ messages: [], signal })[Symbol.asyncIterator]()
    await iterator.next() // first chunk ok
    signal.aborted = true
    await expect(iterator.next()).rejects.toBeInstanceOf(AiError)
  })
})

describe('on-device backend — research track', () => {
  it('honors the async contract: generate rejects, stream throws on iteration (not a sync throw)', async () => {
    const backend = createOnDeviceBackend()
    // generate() must NOT throw synchronously — it returns a rejecting Promise.
    const promise = backend.generate({ messages: [] })
    expect(promise).toBeInstanceOf(Promise)
    await expect(promise).rejects.toBeInstanceOf(NotImplementedError)
    // stream() must NOT throw synchronously — it returns an AsyncIterable that throws on iteration.
    const iterator = backend.stream({ messages: [] })[Symbol.asyncIterator]()
    await expect(iterator.next()).rejects.toBeInstanceOf(NotImplementedError)
  })
})
