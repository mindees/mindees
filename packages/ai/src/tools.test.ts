import { describe, expect, it, vi } from 'vitest'
import type { AiBackend, AiResult, ToolCallPart } from './contract'
import type { AiError } from './errors'
import { createMockBackend } from './mock'
import type { StandardSchemaV1 } from './standard-schema'
import { runTools, type Tool } from './tools'

function call(name: string, args: unknown, id = 'c1'): ToolCallPart {
  return { type: 'tool-call', id, name, args }
}

// `{ a: number, b: number }` Standard Schema (real validators work via the same interface).
function addArgsSchema(): StandardSchemaV1<unknown, { a: number; b: number }> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (v) => {
        const o = v as Record<string, unknown>
        return typeof o?.a === 'number' && typeof o?.b === 'number'
          ? { value: { a: o.a as number, b: o.b as number } }
          : { issues: [{ message: 'a and b must be numbers' }] }
      },
    },
  }
}

describe('runTools', () => {
  it('runs a tool then returns the final text', async () => {
    const execute = vi.fn((args: unknown) => {
      const { a, b } = args as { a: number; b: number }
      return a + b
    })
    const tool: Tool = { name: 'add', validate: addArgsSchema(), execute }
    const backend = createMockBackend({
      script: [{ toolCalls: [call('add', { a: 2, b: 3 })] }, 'The sum is 5.'],
    })
    const result = await runTools(backend, { messages: [{ role: 'user', content: '2+3?' }] }, [
      tool,
    ])
    expect(result.text).toBe('The sum is 5.')
    expect(result.steps).toBe(2)
    expect(execute).toHaveBeenCalledWith({ a: 2, b: 3 }, expect.anything())
    // transcript carries the assistant tool-call + the tool result
    expect(result.messages.some((m) => m.role === 'tool')).toBe(true)
  })

  it('does not mutate the caller input messages', async () => {
    const input = { messages: [{ role: 'user' as const, content: 'hi' }] }
    const before = input.messages.length
    const backend = createMockBackend({ reply: 'done' })
    await runTools(backend, input, [])
    expect(input.messages.length).toBe(before)
  })

  it('enforces a hard maxSteps ceiling (one generate = one step)', async () => {
    let calls = 0
    const backend: Pick<AiBackend, 'generate'> = {
      generate: async (): Promise<AiResult> => {
        calls++
        return { text: '', toolCalls: [call('noop', {})], finishReason: 'tool-calls' }
      },
    }
    const tool: Tool = { name: 'noop', execute: () => 'ok' }
    const err = await runTools(backend, { messages: [] }, [tool], { maxSteps: 3 }).catch((e) => e)
    expect((err as AiError).code).toBe('MAX_STEPS')
    expect(calls).toBe(3)
  })

  it('feeds invalid args back (recoverable) and never executes with them', async () => {
    const execute = vi.fn(() => 5)
    const tool: Tool = { name: 'add', validate: addArgsSchema(), execute }
    const backend = createMockBackend({
      script: [
        { toolCalls: [call('add', { a: 'x', b: 3 }, 'bad')] }, // invalid → fed back
        { toolCalls: [call('add', { a: 2, b: 3 }, 'good')] }, // corrected
        'sum is 5',
      ],
    })
    const result = await runTools(backend, { messages: [] }, [tool])
    expect(result.steps).toBe(3)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith({ a: 2, b: 3 }, expect.anything())
  })

  it('rejects prototype-pollution args before execute, without polluting', async () => {
    const execute = vi.fn(() => 'ok')
    const tool: Tool = { name: 't', execute }
    const backend = createMockBackend({
      script: [{ toolCalls: [call('t', JSON.parse('{"__proto__":{"x":1}}'))] }, 'done'],
    })
    const result = await runTools(backend, { messages: [] }, [tool])
    expect(result.text).toBe('done')
    expect(execute).not.toHaveBeenCalled()
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })

  it('isolates a throwing tool (fed back) and can rethrow when asked', async () => {
    const tool: Tool = {
      name: 'boom',
      execute: () => {
        throw new Error('kaboom')
      },
    }
    const backend = createMockBackend({ script: [{ toolCalls: [call('boom', {})] }, 'recovered'] })
    const ok = await runTools(backend, { messages: [] }, [tool])
    expect(ok.text).toBe('recovered')

    const backend2 = createMockBackend({ script: [{ toolCalls: [call('boom', {})] }, 'unreached'] })
    const err = await runTools(backend2, { messages: [] }, [tool], {
      throwOnToolError: true,
    }).catch((e) => e)
    expect((err as AiError).code).toBe('TOOL_FAILED')
  })

  it('feeds back an unknown tool name without crashing', async () => {
    const tool: Tool = { name: 'known', execute: () => 'ok' }
    const backend = createMockBackend({ script: [{ toolCalls: [call('ghost', {})] }, 'handled'] })
    const result = await runTools(backend, { messages: [] }, [tool])
    expect(result.text).toBe('handled')
  })

  it('dedups identical calls (no duplicate side effects)', async () => {
    const execute = vi.fn(() => 1)
    const tool: Tool = { name: 'inc', execute }
    const backend = createMockBackend({
      script: [
        { toolCalls: [call('inc', {}, 'a')] },
        { toolCalls: [call('inc', {}, 'b')] }, // identical name+args → served from cache
        'done',
      ],
    })
    await runTools(backend, { messages: [] }, [tool])
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('dedups identical calls within ONE parallel turn (no duplicate side effects)', async () => {
    let running = 0
    let maxConcurrent = 0
    const execute = vi.fn(async () => {
      running++
      maxConcurrent = Math.max(maxConcurrent, running)
      await Promise.resolve()
      running--
      return 'ok'
    })
    const tool: Tool = { name: 'send', execute }
    const backend = createMockBackend({
      script: [
        { toolCalls: [call('send', { to: 'a' }, 'x'), call('send', { to: 'a' }, 'y')] }, // identical, same turn
        'done',
      ],
    })
    await runTools(backend, { messages: [] }, [tool])
    expect(execute).toHaveBeenCalledTimes(1) // shared execution, not double-fired
    expect(maxConcurrent).toBe(1)
  })

  it('dedups a FAILING duplicate call too (no re-execution of a throwing tool)', async () => {
    const execute = vi.fn(() => {
      throw new Error('boom')
    })
    const tool: Tool = { name: 'flaky', execute }
    const backend = createMockBackend({
      script: [
        { toolCalls: [call('flaky', { x: 1 }, 'a')] },
        { toolCalls: [call('flaky', { x: 1 }, 'b')] }, // identical → reuse the cached failure
        'done',
      ],
    })
    const result = await runTools(backend, { messages: [] }, [tool])
    expect(result.text).toBe('done')
    expect(execute).toHaveBeenCalledTimes(1) // failure cached, not re-executed
  })

  it('records the terminal assistant answer in the returned transcript', async () => {
    const backend = createMockBackend({ reply: 'final answer' })
    const result = await runTools(backend, { messages: [{ role: 'user', content: 'q' }] }, [])
    const last = result.messages[result.messages.length - 1]
    expect(last).toEqual({ role: 'assistant', content: 'final answer' })
  })

  it('rejects a non-integer / < 1 maxSteps', async () => {
    const backend = createMockBackend({ reply: 'x' })
    await expect(runTools(backend, { messages: [] }, [], { maxSteps: 0 })).rejects.toBeInstanceOf(
      TypeError,
    )
  })

  it('does not crash truncating a circular tool result', async () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const tool: Tool = { name: 'cyc', execute: () => circular }
    const backend = createMockBackend({ script: [{ toolCalls: [call('cyc', {})] }, 'done'] })
    const result = await runTools(backend, { messages: [] }, [tool], { maxToolResultChars: 5 })
    expect(result.text).toBe('done') // no throw, no mislabel-as-failed crash
  })

  it('normalizes a terminal stale "tool-calls" finishReason to "stop"', async () => {
    const backend = createMockBackend({
      reply: { text: 'hi', toolCalls: [], finishReason: 'tool-calls' },
    })
    const result = await runTools(backend, { messages: [] }, [{ name: 't', execute: () => 1 }])
    expect(result.finishReason).toBe('stop')
  })

  it('executes calls even when finishReason is "stop" but tool calls are present', async () => {
    const execute = vi.fn(() => 'ok')
    const tool: Tool = { name: 't', execute }
    const backend = createMockBackend({
      script: [{ text: '', toolCalls: [call('t', {})], finishReason: 'stop' }, 'final'],
    })
    const result = await runTools(backend, { messages: [] }, [tool])
    expect(execute).toHaveBeenCalledTimes(1)
    expect(result.text).toBe('final')
  })

  it('treats finishReason "tool-calls" with no calls as terminal', async () => {
    const backend = createMockBackend({
      reply: { text: 'just text', toolCalls: [], finishReason: 'tool-calls' },
    })
    const result = await runTools(backend, { messages: [] }, [{ name: 't', execute: () => 1 }])
    expect(result.text).toBe('just text')
    expect(result.steps).toBe(1)
  })

  it('aborts between the tool-call turn and execute (no execute runs)', async () => {
    const signal = { aborted: false }
    const execute = vi.fn(() => 'ok')
    const backend: Pick<AiBackend, 'generate'> = {
      generate: async (): Promise<AiResult> => {
        signal.aborted = true // abort right after the tool-call turn
        return { text: '', toolCalls: [call('t', {})], finishReason: 'tool-calls' }
      },
    }
    const err = await runTools(backend, { messages: [] }, [{ name: 't', execute }], {
      signal,
    }).catch((e) => e)
    expect((err as AiError).code).toBe('ABORTED')
    expect(execute).not.toHaveBeenCalled()
  })

  it('throws TypeError on duplicate tool names', async () => {
    const backend = createMockBackend({ reply: 'x' })
    const dup: Tool = { name: 'same', execute: () => 1 }
    await expect(runTools(backend, { messages: [] }, [dup, dup])).rejects.toBeInstanceOf(TypeError)
  })

  it('throws on an async tool-arg schema', async () => {
    const asyncSchema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => Promise.resolve({ value: {} }),
      },
    }
    const tool: Tool = { name: 't', validate: asyncSchema, execute: () => 1 }
    const backend = createMockBackend({ script: [{ toolCalls: [call('t', {})] }, 'x'] })
    const err = await runTools(backend, { messages: [] }, [tool]).catch((e) => e)
    expect((err as AiError).code).toBe('TOOL_FAILED')
  })

  it('truncates an oversized tool result before feeding it back', async () => {
    const tool: Tool = { name: 'big', execute: () => 'x'.repeat(1000) }
    const backend = createMockBackend({ script: [{ toolCalls: [call('big', {})] }, 'done'] })
    const result = await runTools(backend, { messages: [] }, [tool], { maxToolResultChars: 50 })
    const toolMsg = result.messages.find((m) => m.role === 'tool')
    const part = Array.isArray(toolMsg?.content) ? toolMsg?.content[0] : undefined
    const payload =
      part && part.type === 'tool-result' ? (part.result as Record<string, unknown>) : {}
    expect(payload.error).toBe('tool_result_truncated')
  })
})
