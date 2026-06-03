import { describe, expect, it } from 'vitest'
import type { AiBackend, AiChunk, AiResult } from './contract'
import { AiError } from './errors'
import { createMockBackend } from './mock'
import { generateObject, type StreamObjectChunk, streamObject } from './object'
import type { StandardSchemaV1 } from './standard-schema'

interface Obj {
  n: number
}

// Inline Standard Schema for `{ n: number }` (real validators work via the same interface).
function objSchema(): StandardSchemaV1<unknown, Obj> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (v) => {
        if (
          typeof v === 'object' &&
          v !== null &&
          typeof (v as Record<string, unknown>).n === 'number'
        ) {
          return { value: { n: (v as Record<string, unknown>).n as number } }
        }
        return { issues: [{ message: 'n must be a number', path: ['n'] }] }
      },
    },
  }
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const c of stream) out.push(c)
  return out
}

describe('generateObject', () => {
  it('returns a validated object on first try', async () => {
    const backend = createMockBackend({ reply: '{"n":5}' })
    const result = await generateObject(backend, { messages: [] }, objSchema())
    expect(result.object).toEqual({ n: 5 })
    expect(result.attempts).toBe(1)
  })

  it('extracts JSON from fenced / prose-decorated output', async () => {
    const backend = createMockBackend({ reply: 'Sure!\n```json\n{"n":9}\n```' })
    const result = await generateObject(backend, { messages: [] }, objSchema())
    expect(result.object).toEqual({ n: 9 })
  })

  it('repairs then succeeds, accumulating usage', async () => {
    const backend = createMockBackend({ script: ['oops', '{"n":7}'] })
    const result = await generateObject(backend, { messages: [] }, objSchema())
    expect(result.object).toEqual({ n: 7 })
    expect(result.attempts).toBe(2)
    // mock usage.outputTokens = text length per call: len('oops') + len('{"n":7}') = 4 + 7
    expect(result.usage?.outputTokens).toBe(11)
  })

  it('makes exactly 1 + maxRepairs calls then throws INVALID_OBJECT with issues', async () => {
    let calls = 0
    const backend: Pick<AiBackend, 'generate'> = {
      generate: async (): Promise<AiResult> => {
        calls++
        return { text: '{"n":"not-a-number"}', finishReason: 'stop' }
      },
    }
    const err = await generateObject(backend, { messages: [] }, objSchema(), {
      maxRepairs: 2,
    }).catch((e) => e)
    expect(err).toBeInstanceOf(AiError)
    expect((err as AiError).code).toBe('INVALID_OBJECT')
    expect((err as AiError).issues).toBeDefined()
    expect(calls).toBe(3)
  })

  it('rejects prototype-pollution output and does not pollute the prototype', async () => {
    let calls = 0
    const backend: Pick<AiBackend, 'generate'> = {
      generate: async (): Promise<AiResult> => {
        calls++
        return { text: '{"__proto__":{"polluted":1}}', finishReason: 'stop' }
      },
    }
    const err = await generateObject(backend, { messages: [] }, objSchema()).catch((e) => e)
    expect((err as AiError).code).toBe('INVALID_OBJECT')
    expect(calls).toBe(1) // sanitize fails immediately, no repair attempts
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('honors abort between attempts', async () => {
    const signal = { aborted: false }
    const backend: Pick<AiBackend, 'generate'> = {
      generate: async (): Promise<AiResult> => {
        signal.aborted = true // abort after the first (invalid) reply
        return { text: 'not json', finishReason: 'stop' }
      },
    }
    const err = await generateObject(backend, { messages: [], signal }, objSchema()).catch((e) => e)
    expect((err as AiError).code).toBe('ABORTED')
  })

  it('supports async validators', async () => {
    const asyncSchema: StandardSchemaV1<unknown, Obj> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (v) =>
          Promise.resolve(
            typeof (v as Record<string, unknown>)?.n === 'number'
              ? { value: { n: (v as Record<string, unknown>).n as number } }
              : { issues: [{ message: 'no' }] },
          ),
      },
    }
    const backend = createMockBackend({ reply: '{"n":4}' })
    const result = await generateObject(backend, { messages: [] }, asyncSchema)
    expect(result.object).toEqual({ n: 4 })
  })
})

describe('streamObject', () => {
  it('streams text-deltas then a single validated object', async () => {
    const backend = createMockBackend({ reply: '{"n":3}', chunkSize: 2 })
    const chunks = await collect(streamObject(backend, { messages: [] }, objSchema()))
    const deltas = chunks.filter((c) => c.type === 'text-delta')
    const finals = chunks.filter(
      (c): c is Extract<StreamObjectChunk<Obj>, { type: 'object' }> => c.type === 'object',
    )
    expect(deltas.length).toBeGreaterThan(0)
    expect(finals).toEqual([{ type: 'object', object: { n: 3 }, validated: true }])
  })

  it('throws INVALID_OBJECT at end of an unparseable stream', async () => {
    const backend = createMockBackend({ reply: 'definitely not json' })
    await expect(
      collect(streamObject(backend, { messages: [] }, objSchema())),
    ).rejects.toBeInstanceOf(AiError)
  })

  it('emits best-effort partial-object previews when opted in', async () => {
    const backend = createMockBackend({ reply: '{"n":42}', chunkSize: 2 })
    const chunks = await collect(
      streamObject(backend, { messages: [] }, objSchema(), { partial: true }),
    )
    const partials = chunks.filter((c) => c.type === 'partial-object')
    expect(partials.length).toBeGreaterThan(0)
    expect(partials.every((p) => p.type === 'partial-object' && p.validated === false)).toBe(true)
  })

  it('rejects an already-aborted request', async () => {
    const backend: Pick<AiBackend, 'stream'> = {
      stream: async function* (): AsyncIterable<AiChunk> {
        yield { type: 'text-delta', delta: '{"n":1}' }
      },
    }
    await expect(
      collect(streamObject(backend, { messages: [], signal: { aborted: true } }, objSchema())),
    ).rejects.toBeInstanceOf(AiError)
  })

  it('fails with INVALID_OBJECT when the accumulated stream exceeds maxInputChars', async () => {
    const backend = createMockBackend({ reply: '{"n":123456789}', chunkSize: 2 })
    const err = await collect(
      streamObject(backend, { messages: [] }, objSchema(), { maxInputChars: 4 }),
    ).catch((e) => e)
    expect((err as AiError).code).toBe('INVALID_OBJECT')
  })

  it('skips a partial-object preview that carries a poison key', async () => {
    const backend = createMockBackend({ reply: '{"__proto__":{"x":1}}', chunkSize: 4 })
    const err = await collect(
      streamObject(backend, { messages: [] }, objSchema(), { partial: true }),
    ).catch((e) => e)
    // final value is rejected by sanitize, and no poisoned preview was emitted
    expect((err as AiError).code).toBe('INVALID_OBJECT')
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })
})
