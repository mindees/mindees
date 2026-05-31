import { describe, expect, it } from 'vitest'
import { info, maturity, NotImplementedError, name, notImplemented, VERSION } from './index'

describe('@mindees/core', () => {
  it('exposes honest package metadata', () => {
    expect(name).toBe('@mindees/core')
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
    expect(maturity).toBe('experimental')
    expect(info).toEqual({ name: '@mindees/core', version: VERSION, maturity: 'experimental' })
  })

  it('NotImplementedError is throwable, typed, and carries metadata', () => {
    const err = new NotImplementedError('core.future', { rfc: 'RFC-0001' })
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(NotImplementedError)
    expect(err.name).toBe('NotImplementedError')
    expect(err.code).toBe('ERR_MINDEES_NOT_IMPLEMENTED')
    expect(err.feature).toBe('core.future')
    expect(err.rfc).toBe('RFC-0001')
    expect(err.message).toContain('not implemented yet')
  })

  it('notImplemented() always throws NotImplementedError', () => {
    expect(() => notImplemented('core.somethingLater')).toThrow(NotImplementedError)
  })
})
