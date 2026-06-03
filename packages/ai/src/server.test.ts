import { describe, expect, it } from 'vitest'
import type { AiChunk } from './contract'
import { AiError } from './errors'
import {
  createServerBackend,
  type FetchLike,
  type RequestInitLike,
  type ResponseLike,
} from './server'
import { runTools, type Tool } from './tools'

const enc = new TextEncoder()
async function* bodyOf(text: string): AsyncIterable<Uint8Array> {
  // emit in two slices to exercise chunk-boundary handling
  const mid = Math.floor(text.length / 2)
  yield enc.encode(text.slice(0, mid))
  yield enc.encode(text.slice(mid))
}

/** A fake fetch returning a canned JSON or SSE body, capturing the request. */
function fakeFetch(
  response: Partial<ResponseLike>,
  capture?: (url: string, init: RequestInitLike) => void,
): FetchLike {
  return (url, init) => {
    capture?.(url, init)
    return Promise.resolve({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: response.json ?? (() => Promise.resolve({})),
      text: response.text ?? (() => Promise.resolve('')),
      body: response.body ?? null,
    })
  }
}

async function collect(stream: AsyncIterable<AiChunk>): Promise<AiChunk[]> {
  const out: AiChunk[] = []
  for await (const c of stream) out.push(c)
  return out
}

describe('server backend — openai adapter', () => {
  it('generate() maps an OpenAI chat-completion response', async () => {
    let seenUrl = ''
    let seenInit: RequestInitLike | undefined
    const fetch = fakeFetch(
      {
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 3, completion_tokens: 2 },
          }),
      },
      (url, init) => {
        seenUrl = url
        seenInit = init
      },
    )
    const ai = createServerBackend({
      fetch,
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-x',
      apiKey: 'k',
    })
    const result = await ai.generate({ messages: [{ role: 'user', content: 'hi' }] })
    expect(result).toEqual({
      text: 'hello',
      finishReason: 'stop',
      usage: { inputTokens: 3, outputTokens: 2 },
    })
    expect(seenUrl).toBe('https://api.example.com/v1/chat/completions')
    expect(seenInit?.headers.authorization).toBe('Bearer k')
  })

  it('stream() parses an OpenAI SSE stream into chunks', async () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"He"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n' +
      'data: {"choices":[{"finish_reason":"stop"}],"usage":{"completion_tokens":2}}\n\n' +
      'data: [DONE]\n\n'
    const ai = createServerBackend({
      fetch: fakeFetch({ body: bodyOf(sse) }),
      baseUrl: 'x',
      model: 'm',
    })
    const chunks = await collect(ai.stream({ messages: [] }))
    expect(chunks).toEqual([
      { type: 'text-delta', delta: 'He' },
      { type: 'text-delta', delta: 'llo' },
      { type: 'finish', finishReason: 'stop', usage: { inputTokens: undefined, outputTokens: 2 } },
    ])
  })
})

describe('server backend — openai streamed usage + done robustness', () => {
  it('captures usage from the trailing choices:[] usage chunk (include_usage)', async () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n' +
      'data: {"choices":[{"finish_reason":"stop"}],"usage":null}\n\n' +
      'data: {"choices":[],"usage":{"prompt_tokens":4,"completion_tokens":1}}\n\n' +
      'data: [DONE]\n\n'
    const ai = createServerBackend({
      fetch: fakeFetch({ body: bodyOf(sse) }),
      baseUrl: 'x',
      model: 'm',
    })
    const chunks = await collect(ai.stream({ messages: [] }))
    const finishes = chunks.filter(
      (c): c is Extract<AiChunk, { type: 'finish' }> => c.type === 'finish',
    )
    expect(finishes.some((f) => f.usage?.outputTokens === 1 && f.usage?.inputTokens === 4)).toBe(
      true,
    )
  })

  it('carries a non-stop finish_reason onto the trailing usage-only chunk', async () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n' +
      'data: {"choices":[{"finish_reason":"length"}],"usage":null}\n\n' +
      'data: {"choices":[],"usage":{"prompt_tokens":4,"completion_tokens":9}}\n\n' +
      'data: [DONE]\n\n'
    const ai = createServerBackend({
      fetch: fakeFetch({ body: bodyOf(sse) }),
      baseUrl: 'x',
      model: 'm',
    })
    const chunks = await collect(ai.stream({ messages: [] }))
    const finishes = chunks.filter(
      (c): c is Extract<AiChunk, { type: 'finish' }> => c.type === 'finish',
    )
    // both finish chunks report the real reason — not a fabricated 'stop'
    expect(finishes.every((f) => f.finishReason === 'length')).toBe(true)
    // and the usage-bearing one has the tokens
    expect(finishes.some((f) => f.usage?.outputTokens === 9 && f.usage?.inputTokens === 4)).toBe(
      true,
    )
  })

  it('tolerates a [DONE] sentinel with extra whitespace', async () => {
    const sse = 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata:  [DONE]\n\n'
    const ai = createServerBackend({
      fetch: fakeFetch({ body: bodyOf(sse) }),
      baseUrl: 'x',
      model: 'm',
    })
    const chunks = await collect(ai.stream({ messages: [] }))
    expect(chunks).toContainEqual({ type: 'text-delta', delta: 'ok' }) // no STREAM_PARSE on the sentinel
  })

  it('honors mid-stream abort', async () => {
    const signal = { aborted: false }
    async function* body(): AsyncIterable<Uint8Array> {
      yield enc.encode('data: {"choices":[{"delta":{"content":"a"}}]}\n\n')
      signal.aborted = true // abort after the first event
      yield enc.encode('data: {"choices":[{"delta":{"content":"b"}}]}\n\n')
    }
    const ai = createServerBackend({ fetch: fakeFetch({ body: body() }), baseUrl: 'x', model: 'm' })
    const seen: AiChunk[] = []
    await expect(
      (async () => {
        for await (const c of ai.stream({ messages: [], signal })) seen.push(c)
      })(),
    ).rejects.toBeInstanceOf(AiError)
    expect(seen).toContainEqual({ type: 'text-delta', delta: 'a' })
    expect(seen).not.toContainEqual({ type: 'text-delta', delta: 'b' })
  })
})

describe('server backend — anthropic adapter', () => {
  it('generate() maps an Anthropic messages response + uses x-api-key auth', async () => {
    let seenInit: RequestInitLike | undefined
    const fetch = fakeFetch(
      {
        json: () =>
          Promise.resolve({
            content: [{ type: 'text', text: 'hi there' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 5, output_tokens: 3 },
          }),
      },
      (_url, init) => {
        seenInit = init
      },
    )
    const ai = createServerBackend({
      fetch,
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-x',
      apiKey: 'k',
      adapter: 'anthropic',
    })
    const result = await ai.generate({ messages: [{ role: 'user', content: 'hi' }] })
    expect(result.text).toBe('hi there')
    expect(result.finishReason).toBe('stop')
    expect(seenInit?.headers['x-api-key']).toBe('k')
    expect(seenInit?.headers['anthropic-version']).toBe('2023-06-01')
  })

  it('stream() parses Anthropic content_block_delta + message_delta', async () => {
    const sse =
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n' +
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\n'
    const ai = createServerBackend({
      fetch: fakeFetch({ body: bodyOf(sse) }),
      baseUrl: 'x',
      model: 'm',
      adapter: 'anthropic',
    })
    const chunks = await collect(ai.stream({ messages: [] }))
    expect(chunks).toEqual([
      { type: 'text-delta', delta: 'Hi' },
      { type: 'finish', finishReason: 'stop', usage: { outputTokens: 1 } },
    ])
  })
})

describe('server backend — tool calling', () => {
  it('openai: serializes tools and parses tool_calls into AiResult.toolCalls', async () => {
    let seenInit: RequestInitLike | undefined
    const fetch = fakeFetch(
      {
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: 't1',
                      type: 'function',
                      function: { name: 'add', arguments: '{"a":2,"b":3}' },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
          }),
      },
      (_url, init) => {
        seenInit = init
      },
    )
    const ai = createServerBackend({ fetch, baseUrl: 'x', model: 'm' })
    const result = await ai.generate({
      messages: [{ role: 'user', content: '2+3?' }],
      tools: [{ name: 'add', description: 'add two', parameters: { type: 'object' } }],
    })
    expect(result.finishReason).toBe('tool-calls')
    expect(result.toolCalls).toEqual([
      { type: 'tool-call', id: 't1', name: 'add', args: { a: 2, b: 3 } },
    ])
    const body = JSON.parse(seenInit?.body ?? '{}')
    expect(body.tools[0]).toEqual({
      type: 'function',
      function: { name: 'add', description: 'add two', parameters: { type: 'object' } },
    })
  })

  it('openai: a malformed tool-call arguments string becomes empty args', async () => {
    const fetch = fakeFetch({
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: { tool_calls: [{ id: 't', function: { name: 'x', arguments: '{bad' } }] },
              finish_reason: 'tool_calls',
            },
          ],
        }),
    })
    const ai = createServerBackend({ fetch, baseUrl: 'x', model: 'm' })
    const result = await ai.generate({ messages: [] })
    expect(result.toolCalls).toEqual([{ type: 'tool-call', id: 't', name: 'x', args: {} }])
  })

  it('anthropic: serializes tools and parses tool_use blocks', async () => {
    let seenInit: RequestInitLike | undefined
    const fetch = fakeFetch(
      {
        json: () =>
          Promise.resolve({
            content: [
              { type: 'text', text: 'let me add' },
              { type: 'tool_use', id: 'u1', name: 'add', input: { a: 1, b: 2 } },
            ],
            stop_reason: 'tool_use',
          }),
      },
      (_url, init) => {
        seenInit = init
      },
    )
    const ai = createServerBackend({ fetch, baseUrl: 'x', model: 'm', adapter: 'anthropic' })
    const result = await ai.generate({
      messages: [],
      tools: [{ name: 'add', parameters: { type: 'object' } }],
    })
    expect(result.text).toBe('let me add')
    expect(result.finishReason).toBe('tool-calls')
    expect(result.toolCalls).toEqual([
      { type: 'tool-call', id: 'u1', name: 'add', args: { a: 1, b: 2 } },
    ])
    const body = JSON.parse(seenInit?.body ?? '{}')
    expect(body.tools[0]).toEqual({ name: 'add', input_schema: { type: 'object' } })
  })
})

describe('server backend — runTools round-trips a tool turn (mapper serialization)', () => {
  interface Body {
    messages: Array<Record<string, unknown>>
  }
  const addTool: Tool = {
    name: 'add',
    parameters: { type: 'object' },
    execute: (args) => {
      const { a, b } = args as { a: number; b: number }
      return a + b
    },
  }

  it('openai: 2nd request carries assistant tool_calls + a tool message with tool_call_id', async () => {
    const bodies: Body[] = []
    let turn = 0
    const fetch: FetchLike = (_url, init) => {
      bodies.push(JSON.parse(init.body) as Body)
      turn++
      const json =
        turn === 1
          ? {
              choices: [
                {
                  message: {
                    content: null,
                    tool_calls: [
                      {
                        id: 'tc1',
                        type: 'function',
                        function: { name: 'add', arguments: '{"a":2,"b":3}' },
                      },
                    ],
                  },
                  finish_reason: 'tool_calls',
                },
              ],
            }
          : { choices: [{ message: { content: 'The answer is 5.' }, finish_reason: 'stop' }] }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(json),
        text: () => Promise.resolve(''),
        body: null,
      })
    }
    const ai = createServerBackend({ fetch, baseUrl: 'x', model: 'm' })
    const result = await runTools(ai, { messages: [{ role: 'user', content: '2+3?' }] }, [addTool])
    expect(result.text).toBe('The answer is 5.')
    expect(result.steps).toBe(2)
    const t2 = bodies[1]
    const assistant = t2?.messages.find((m) => m.role === 'assistant' && 'tool_calls' in m)
    expect((assistant?.tool_calls as Array<{ function: { name: string } }>)[0]?.function.name).toBe(
      'add',
    )
    const toolMsg = t2?.messages.find((m) => m.role === 'tool')
    expect(toolMsg?.tool_call_id).toBe('tc1')
    expect(String(toolMsg?.content)).toContain('5')
  })

  it('anthropic: 2nd request carries a tool_use block + a user tool_result block', async () => {
    const bodies: Body[] = []
    let turn = 0
    const fetch: FetchLike = (_url, init) => {
      bodies.push(JSON.parse(init.body) as Body)
      turn++
      const json =
        turn === 1
          ? {
              content: [{ type: 'tool_use', id: 'u1', name: 'add', input: { a: 1, b: 2 } }],
              stop_reason: 'tool_use',
            }
          : { content: [{ type: 'text', text: 'It is 3.' }], stop_reason: 'end_turn' }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(json),
        text: () => Promise.resolve(''),
        body: null,
      })
    }
    const ai = createServerBackend({ fetch, baseUrl: 'x', model: 'm', adapter: 'anthropic' })
    const result = await runTools(ai, { messages: [{ role: 'user', content: '1+2?' }] }, [addTool])
    expect(result.text).toBe('It is 3.')
    const t2 = bodies[1]
    const assistant = t2?.messages.find((m) => m.role === 'assistant')
    const blocks = assistant?.content as Array<{ type: string; name?: string }>
    expect(blocks.some((b) => b.type === 'tool_use' && b.name === 'add')).toBe(true)
    const userResult = t2?.messages.find(
      (m) =>
        m.role === 'user' &&
        Array.isArray(m.content) &&
        (m.content as Array<{ type: string }>).some((b) => b.type === 'tool_result'),
    )
    expect(userResult).toBeDefined()
  })
})

describe('server backend — errors', () => {
  it('throws NO_TRANSPORT without a fetch', () => {
    expect(() =>
      createServerBackend({ fetch: undefined as unknown as FetchLike, baseUrl: 'x', model: 'm' }),
    ).toThrow(AiError)
  })

  it('throws HTTP_STATUS on a non-2xx response', async () => {
    const ai = createServerBackend({
      fetch: fakeFetch({ ok: false, status: 429, text: () => Promise.resolve('rate limited') }),
      baseUrl: 'x',
      model: 'm',
    })
    await expect(ai.generate({ messages: [] })).rejects.toBeInstanceOf(AiError)
  })

  it('throws STREAM_PARSE on malformed SSE JSON', async () => {
    const ai = createServerBackend({
      fetch: fakeFetch({ body: bodyOf('data: {not json\n\n') }),
      baseUrl: 'x',
      model: 'm',
    })
    await expect(collect(ai.stream({ messages: [] }))).rejects.toBeInstanceOf(AiError)
  })

  it('rejects an already-aborted request', async () => {
    const ai = createServerBackend({ fetch: fakeFetch({}), baseUrl: 'x', model: 'm' })
    await expect(ai.generate({ messages: [], signal: { aborted: true } })).rejects.toBeInstanceOf(
      AiError,
    )
  })
})
