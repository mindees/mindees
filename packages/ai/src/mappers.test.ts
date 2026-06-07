import { describe, expect, it } from 'vitest'
import type { GenerateRequest } from './contract'
import { openaiMapper } from './mappers'

describe('openaiMapper tool-result serialization (toWireString)', () => {
  it('serializes a bigint-bearing tool result losslessly (not "[object Object]")', () => {
    const request: GenerateRequest = {
      messages: [
        {
          role: 'tool',
          content: [{ type: 'tool-result', id: 'tc1', name: 'calc', result: { count: 10n } }],
        },
      ],
    }
    const { body } = openaiMapper.buildRequest(request, 'gpt-4', false)
    const messages = (body as { messages: Array<{ role: string; content: string }> }).messages
    const tool = messages.find((m) => m.role === 'tool')
    expect(tool?.content).toBe('{"count":"10"}') // bigint → decimal string, real JSON
    expect(tool?.content).not.toContain('[object Object]')
  })
})
