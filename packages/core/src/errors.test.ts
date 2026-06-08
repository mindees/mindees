import { describe, expect, it } from 'vitest'
import { MindeesError, NotImplementedError } from './errors'

describe('MindeesError base', () => {
  it('carries a code + name and is an Error', () => {
    const e = new MindeesError('SOME_CODE', 'boom')
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(MindeesError)
    expect(e.code).toBe('SOME_CODE')
    expect(e.name).toBe('MindeesError')
    expect(e.message).toBe('boom')
  })

  it('NotImplementedError extends MindeesError with its stable code preserved', () => {
    const e = new NotImplementedError('on-device LLM', { rfc: 'RFC-0007' })
    expect(e).toBeInstanceOf(MindeesError)
    expect(e).toBeInstanceOf(NotImplementedError)
    expect(e.code).toBe('ERR_MINDEES_NOT_IMPLEMENTED') // not undefined (declare + super)
    expect(e.name).toBe('NotImplementedError')
    expect(e.feature).toBe('on-device LLM')
    expect(e.rfc).toBe('RFC-0007')
    expect(e.message).toContain('RFC-0007')
  })
})
