import { describe, expect, it } from 'vitest'
import { info, maturity, NotImplementedError, name, notImplemented, VERSION } from './index'

describe('@mindees/updates (scaffold)', () => {
  it('exposes honest package metadata', () => {
    expect(name).toBe('@mindees/updates')
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
    expect(maturity).toBe('scaffold')
    expect(info).toEqual({ name: '@mindees/updates', version: VERSION, maturity: 'scaffold' })
  })

  it('re-exports a throwable NotImplementedError', () => {
    expect(() => notImplemented('updates.future', { rfc: 'RFC-0001' })).toThrow(NotImplementedError)
  })
})
