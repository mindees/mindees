import { describe, expect, it } from 'vitest'
import { info, maturity, NotImplementedError, name, notImplemented, VERSION } from './index'

describe('@mindees/atlas', () => {
  it('exposes honest package metadata', () => {
    expect(name).toBe('@mindees/atlas')
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
    expect(maturity).toBe('experimental')
    expect(info).toEqual({ name: '@mindees/atlas', version: VERSION, maturity: 'experimental' })
  })

  it('info is frozen so its self-reported identity cannot be mutated at runtime', () => {
    expect(Object.isFrozen(info)).toBe(true)
    expect(() => {
      ;(info as { version: string }).version = '9.9.9'
    }).toThrow()
    expect(info.version).toBe(VERSION)
  })

  it('re-exports a throwable NotImplementedError', () => {
    expect(() => notImplemented('atlas.future', { rfc: 'RFC-0001' })).toThrow(NotImplementedError)
  })
})
