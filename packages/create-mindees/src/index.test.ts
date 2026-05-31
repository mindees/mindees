import { describe, expect, it } from 'vitest'
import { info, maturity, NotImplementedError, name, notImplemented, VERSION } from './index'

describe('create-mindees (scaffold)', () => {
  it('exposes honest package metadata', () => {
    expect(name).toBe('create-mindees')
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
    expect(maturity).toBe('scaffold')
    expect(info).toEqual({ name: 'create-mindees', version: VERSION, maturity: 'scaffold' })
  })

  it('re-exports a throwable NotImplementedError', () => {
    expect(() => notImplemented('create-mindees.future', { rfc: 'RFC-0001' })).toThrow(
      NotImplementedError,
    )
  })
})
