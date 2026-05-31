import { describe, expect, it } from 'vitest'
import { info, maturity, NotImplementedError, name, notImplemented, VERSION } from './index'

describe('@mindees/atlas (scaffold)', () => {
  it('exposes honest package metadata', () => {
    expect(name).toBe('@mindees/atlas')
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
    expect(maturity).toBe('scaffold')
    expect(info).toEqual({ name: '@mindees/atlas', version: VERSION, maturity: 'scaffold' })
  })

  it('re-exports a throwable NotImplementedError', () => {
    expect(() => notImplemented('atlas.future', { rfc: 'RFC-0001' })).toThrow(NotImplementedError)
  })
})
