import { describe, expect, it } from 'vitest'
import { info, maturity, NotImplementedError, name, notImplemented, VERSION } from './index'

describe('@mindees/renderer', () => {
  it('exposes honest package metadata', () => {
    expect(name).toBe('@mindees/renderer')
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
    expect(maturity).toBe('experimental')
    expect(info).toEqual({ name: '@mindees/renderer', version: VERSION, maturity: 'experimental' })
  })

  it('re-exports a throwable NotImplementedError', () => {
    expect(() => notImplemented('renderer.future', { rfc: 'RFC-0001' })).toThrow(
      NotImplementedError,
    )
  })
})
