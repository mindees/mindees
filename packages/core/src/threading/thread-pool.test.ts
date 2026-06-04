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
          // biome-ignore lint/security/noGlobalEval: this test simulates worker-side job deserialization.
          const indirectEval = globalThis.eval
          const fn = indirectEval(`(${source})`) as (input: unknown) => unknown
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

describe('createWorkerPool — worker crash handling', () => {
  it('a crash rejects that worker’s job, not another (healthy) worker’s', async () => {
    // Each worker replies ok unless the input is 'boom', in which case it crashes.
    const createWorker = (): WorkerLike => {
      const w: WorkerLike = {
        onmessage: null,
        onerror: null,
        postMessage(message) {
          const { id, input } = message as { id: number; input: unknown }
          if (input === 'boom') queueMicrotask(() => w.onerror?.({ message: 'crashed' }))
          else queueMicrotask(() => w.onmessage?.({ data: { id, ok: true, result: input } }))
        },
        terminate() {},
      }
      return w
    }
    const pool = createWorkerPool({ size: 2, createWorker })
    const a = pool.run((x: unknown) => x, 'healthy') // -> worker 0
    const b = pool.run((x: unknown) => x, 'boom') // -> worker 1 (crashes)
    await expect(a).resolves.toBe('healthy') // untouched by worker 1's crash
    await expect(b).rejects.toThrow('crashed') // the crashed worker's own job
    pool.dispose()
  })

  it('a crash rejects ALL of the crashed worker’s in-flight jobs (not just one)', async () => {
    const createWorker = (): WorkerLike => {
      const w: WorkerLike = {
        onmessage: null,
        onerror: null,
        postMessage(message) {
          const { input } = message as { input: unknown }
          // 'boom' crashes the worker; other jobs stay in flight (never reply).
          if (input === 'boom') queueMicrotask(() => w.onerror?.({ message: 'crashed' }))
        },
        terminate() {},
      }
      return w
    }
    const pool = createWorkerPool({ size: 1, createWorker }) // all jobs share one worker
    const p0 = pool.run((x: unknown) => x, 'a') // in flight
    const p1 = pool.run((x: unknown) => x, 'b') // in flight
    const p2 = pool.run((x: unknown) => x, 'boom') // crashes the worker
    const settled = await Promise.allSettled([p0, p1, p2])
    expect(settled.map((s) => s.status)).toEqual(['rejected', 'rejected', 'rejected'])
    pool.dispose()
  })

  it('replaces a crashed worker so the pool keeps working', async () => {
    let generation = 0
    const createWorker = (): WorkerLike => {
      const gen = generation++
      const w: WorkerLike = {
        onmessage: null,
        onerror: null,
        postMessage(message) {
          const { id, input } = message as { id: number; input: unknown }
          // The first worker crashes on its first job; its replacement works.
          if (gen === 0) queueMicrotask(() => w.onerror?.({ message: 'crashed' }))
          else queueMicrotask(() => w.onmessage?.({ data: { id, ok: true, result: input } }))
        },
        terminate() {},
      }
      return w
    }
    const pool = createWorkerPool({ size: 1, createWorker })
    await expect(pool.run((x: unknown) => x, 1)).rejects.toThrow('crashed') // gen 0 crashes
    await expect(pool.run((x: unknown) => x, 2)).resolves.toBe(2) // gen 1 (replacement) works
    expect(pool.size).toBe(1) // pool stays live, size accurate
    pool.dispose()
  })
})

describe('createNativeThreadPool (research track)', () => {
  it('throws NotImplementedError (honest, not a silent stub)', () => {
    expect(() => createNativeThreadPool()).toThrow(NotImplementedError)
  })
})
