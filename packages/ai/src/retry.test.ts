import { describe, expect, it, vi } from 'vitest'
import type { AiBackend, AiChunk, AiResult, GenerateRequest } from './contract'
import { withRetry } from './retry'

const ok = (text: string): AiResult => ({ text, finishReason: 'stop' })

/** A backend driven by a script of behaviors; counts generate calls. */
function scripted(behaviors: Array<'fail' | AiResult>): {
  backend: AiBackend
  calls: () => number
} {
  let i = 0
  const backend: AiBackend = {
    generate: async (_request: GenerateRequest): Promise<AiResult> => {
      const beh = behaviors[Math.min(i, behaviors.length - 1)]
      i += 1
      if (beh === 'fail' || beh === undefined) throw new Error('transient')
      return beh
    },
    stream: (): AsyncIterable<AiChunk> => {
      throw new Error('unused in these tests')
    },
  }
  return { backend, calls: () => i }
}

const req: GenerateRequest = { messages: [{ role: 'user', content: 'hi' }] }
const noSleep = async (): Promise<void> => {}

describe('withRetry', () => {
  it('succeeds after retrying transient failures', async () => {
    const { backend, calls } = scripted(['fail', 'fail', ok('done')])
    const wrapped = withRetry(backend, { maxAttempts: 3, sleep: noSleep })
    expect((await wrapped.generate(req)).text).toBe('done')
    expect(calls()).toBe(3)
  })

  it('throws after exhausting maxAttempts', async () => {
    const { backend, calls } = scripted(['fail'])
    const wrapped = withRetry(backend, { maxAttempts: 2, sleep: noSleep })
    await expect(wrapped.generate(req)).rejects.toThrow('transient')
    expect(calls()).toBe(2) // exactly maxAttempts, no more
  })

  it('does not retry when shouldRetry returns false', async () => {
    const { backend, calls } = scripted(['fail', ok('never')])
    const wrapped = withRetry(backend, { maxAttempts: 5, shouldRetry: () => false, sleep: noSleep })
    await expect(wrapped.generate(req)).rejects.toThrow('transient')
    expect(calls()).toBe(1) // failed once, gave up
  })

  it('backs off between attempts (sleep called with the computed delays)', async () => {
    const { backend } = scripted(['fail', 'fail', ok('ok')])
    const sleep = vi.fn(async (_ms: number) => {})
    await withRetry(backend, {
      maxAttempts: 3,
      backoffMs: (attempt) => attempt * 10,
      sleep,
    }).generate(req)
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([10, 20]) // before attempts 2 and 3
  })

  it('a backend that succeeds first time is called exactly once', async () => {
    const { backend, calls } = scripted([ok('first')])
    expect((await withRetry(backend, { sleep: noSleep }).generate(req)).text).toBe('first')
    expect(calls()).toBe(1)
  })
})
