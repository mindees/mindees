import { describe, expect, it } from 'vitest'
import { type ErrorExplanation, explainError, formatExplanation } from './devtools'
import { AiError } from './errors'
import { createMockBackend } from './mock'

const good = JSON.stringify({
  summary: 'A function was called on undefined.',
  likelyCauses: ['The variable was never assigned', 'A typo in the import'],
  suggestedFixes: ['Add a null check', 'Verify the import path'],
})

describe('explainError', () => {
  it('returns a structured explanation from a JSON reply', async () => {
    const backend = createMockBackend({ reply: good })
    const explanation = await explainError(backend, { message: 'x is not a function' })
    expect(explanation.summary).toBe('A function was called on undefined.')
    expect(explanation.likelyCauses).toHaveLength(2)
    expect(explanation.suggestedFixes[0]).toBe('Add a null check')
  })

  it('accepts an Error instance (normalizes message/stack/code)', async () => {
    const backend = createMockBackend({ reply: good })
    const err = Object.assign(new Error('boom'), { code: 'E_BOOM' })
    const explanation = await explainError(backend, err, { language: 'TypeScript' })
    expect(explanation.summary).toBeTruthy()
  })

  it('repairs a malformed first reply then succeeds', async () => {
    const backend = createMockBackend({ script: ['not json at all', good] })
    const explanation = await explainError(backend, { message: 'oops' })
    expect(explanation.summary).toBeTruthy()
  })

  it('coerces missing arrays to empty', async () => {
    const backend = createMockBackend({ reply: JSON.stringify({ summary: 'just a summary' }) })
    const explanation = await explainError(backend, { message: 'e' })
    expect(explanation.likelyCauses).toEqual([])
    expect(explanation.suggestedFixes).toEqual([])
  })

  it('throws INVALID_OBJECT when no usable explanation is produced', async () => {
    const backend = createMockBackend({ reply: JSON.stringify({ notSummary: 1 }) })
    await expect(explainError(backend, { message: 'e' }, { maxRepairs: 1 })).rejects.toBeInstanceOf(
      AiError,
    )
  })

  it('coerces a non-array field and drops non-string elements', async () => {
    const backend = createMockBackend({
      reply: JSON.stringify({
        summary: 's',
        likelyCauses: 'oops',
        suggestedFixes: [1, 'keep', null],
      }),
    })
    const explanation = await explainError(backend, { message: 'e' })
    expect(explanation.likelyCauses).toEqual([])
    expect(explanation.suggestedFixes).toEqual(['keep'])
  })

  it('propagates an already-aborted signal', async () => {
    const backend = createMockBackend({ reply: good })
    await expect(
      explainError(backend, { message: 'e' }, { signal: { aborted: true } }),
    ).rejects.toBeInstanceOf(AiError)
  })
})

describe('formatExplanation', () => {
  it('renders summary, causes, and fixes', () => {
    const explanation: ErrorExplanation = {
      summary: 'Bad thing',
      likelyCauses: ['cause one'],
      suggestedFixes: ['fix one', 'fix two'],
    }
    const text = formatExplanation(explanation)
    expect(text).toContain('Summary: Bad thing')
    expect(text).toContain('• cause one')
    expect(text).toContain('• fix two')
  })

  it('omits empty sections', () => {
    const text = formatExplanation({ summary: 'S', likelyCauses: [], suggestedFixes: [] })
    expect(text).toBe('Summary: S')
  })
})
