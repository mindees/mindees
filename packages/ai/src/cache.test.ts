import { describe, expect, it } from 'vitest'
import { withCache } from './cache'
import type { AiBackend, AiChunk, AiResult, GenerateRequest } from './contract'

const ok = (text: string): AiResult => ({ text, finishReason: 'stop' })

/** A backend that returns a per-call counter in the text; tracks how many times it ran. */
function counting(): { backend: AiBackend; calls: () => number } {
  let n = 0
  const backend: AiBackend = {
    generate: async (_request: GenerateRequest): Promise<AiResult> => {
      n += 1
      return ok(`run-${n}`)
    },
    stream: (): AsyncIterable<AiChunk> => {
      throw new Error('unused')
    },
  }
  return { backend, calls: () => n }
}

const req = (content: string): GenerateRequest => ({ messages: [{ role: 'user', content }] })

describe('withCache', () => {
  it('serves identical requests from cache (one backend call)', async () => {
    const { backend, calls } = counting()
    const ai = withCache(backend)
    expect((await ai.generate(req('hi'))).text).toBe('run-1')
    expect((await ai.generate(req('hi'))).text).toBe('run-1') // cached
    expect(calls()).toBe(1)
  })

  it('misses for different requests', async () => {
    const { backend, calls } = counting()
    const ai = withCache(backend)
    await ai.generate(req('a'))
    await ai.generate(req('b'))
    expect(calls()).toBe(2)
  })

  it('expires entries after ttlMs (injected clock)', async () => {
    const { backend, calls } = counting()
    let t = 1000
    const ai = withCache(backend, { ttlMs: 500, now: () => t })
    expect((await ai.generate(req('x'))).text).toBe('run-1')
    t = 1400 // within TTL
    expect((await ai.generate(req('x'))).text).toBe('run-1')
    expect(calls()).toBe(1)
    t = 1600 // past TTL → re-fetch
    expect((await ai.generate(req('x'))).text).toBe('run-2')
    expect(calls()).toBe(2)
  })

  it('evicts the least-recently-used entry past maxEntries', async () => {
    const { backend, calls } = counting()
    const ai = withCache(backend, { maxEntries: 2 })
    await ai.generate(req('a')) // [a]
    await ai.generate(req('b')) // [a,b]
    await ai.generate(req('a')) // hit → recency [b,a]
    await ai.generate(req('c')) // evicts b (LRU) → [a,c]
    expect(calls()).toBe(3) // a, b, c each fetched once (a's 2nd was a hit)
    await ai.generate(req('a')) // still cached
    expect(calls()).toBe(3)
    await ai.generate(req('b')) // b was evicted → re-fetch
    expect(calls()).toBe(4)
  })
})
