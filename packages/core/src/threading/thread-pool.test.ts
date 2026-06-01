import { describe, expect, it, vi } from 'vitest'
import { NotImplementedError } from '../errors'
import {
  createInlineThreadPool,
  createNativeThreadPool,
  createWorkerPool,
  type WorkerLike,
} from './thread-pool'

describe('createInlineThreadPool', () => {
  it('runs a job and resolves its result', async () => {
    const pool = createInlineThreadPool()
    await expect(pool.run((n: number) => n * 2, 21)).resolves.toBe(42)
    expect(pool.size).toBe(0)
  })

  it('rejects when the job throws', async () => {
    const pool = createInlineThreadPool()
    await expect(
      pool.run(() => {
        throw new Error('nope')
      }, undefined),
    ).rejects.toThrow('nope')
  })

  it('rejects after dispose', async () => {
    const pool = createInlineThreadPool()
    pool.dispose()
    await expect(pool.run((x: number) => x, 1)).rejects.toThrow('disposed')
  })
})

/** A fake Worker that executes the serialized job synchronously on postMessage. */
function makeFakeWorker(): WorkerLike {
  const w: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(message: unknown) {
      const { id, source, input } = message as { id: number; source: string; input: unknown }
      queueMicrotask(() => {
        try {
          // biome-ignore lint/security/noGlobalEval: test-only worker simulation of job deserialization
          const fn = (0, eval)(`(${source})`) as (input: unknown) => unknown
          const result = fn(input)
          w.onmessage?.({ data: { id, ok: true, result } })
        } catch (error) {
          w.onmessage?.({ data: { id, ok: false, error: (error as Error).message } })
        }
      })
    },
    terminate() {},
  }
  return w
}

describe('createWorkerPool', () => {
  it('runs a job in a (fake) worker and resolves the result', async () => {
    const pool = createWorkerPool({ createWorker: makeFakeWorker })
    await expect(pool.run((n: number) => n + 1, 41)).resolves.toBe(42)
    expect(pool.size).toBe(1)
    pool.dispose()
  })

  it('round-trips multiple jobs across a pool', async () => {
    const pool = createWorkerPool({ size: 3, createWorker: makeFakeWorker })
    const results = await Promise.all([
      pool.run((n: number) => n * 10, 1),
      pool.run((n: number) => n * 10, 2),
      pool.run((n: number) => n * 10, 3),
    ])
    expect(results).toEqual([10, 20, 30])
    expect(pool.size).toBe(3)
    pool.dispose()
  })

  it('rejects a job whose worker function throws', async () => {
    const pool = createWorkerPool({ createWorker: makeFakeWorker })
    await expect(
      pool.run(() => {
        throw new Error('worker boom')
      }, null),
    ).rejects.toThrow('worker boom')
    pool.dispose()
  })

  it('terminates workers and rejects in-flight jobs on dispose', async () => {
    const terminate = vi.fn()
    const neverReplies: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage() {}, // never responds
      terminate,
    }
    const pool = createWorkerPool({ createWorker: () => neverReplies })
    const p = pool.run((x: number) => x, 1)
    pool.dispose()
    await expect(p).rejects.toThrow('disposed')
    expect(terminate).toHaveBeenCalledTimes(1)
    expect(pool.size).toBe(0)
  })
})

describe('createNativeThreadPool (research track)', () => {
  it('throws NotImplementedError (honest, not a silent stub)', () => {
    expect(() => createNativeThreadPool()).toThrow(NotImplementedError)
  })
})
