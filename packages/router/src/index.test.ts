import { describe, expect, it } from 'vitest'
import {
  buildPath,
  createMemoryHistory,
  createRouter,
  info,
  matchPattern,
  maturity,
  NotImplementedError,
  name,
  notImplemented,
  parseQuery,
  VERSION,
  validateSearch,
} from './index'

describe('@mindees/router public API', () => {
  it('exposes honest package metadata', () => {
    expect(name).toBe('@mindees/router')
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
    expect(maturity).toBe('experimental')
    expect(info).toEqual({ name: '@mindees/router', version: VERSION, maturity: 'experimental' })
  })

  it('re-exports a throwable NotImplementedError', () => {
    expect(() => notImplemented('router.future', { rfc: 'RFC-0001' })).toThrow(NotImplementedError)
  })

  it('re-exports the routing core', () => {
    expect(typeof createRouter).toBe('function')
    expect(typeof createMemoryHistory).toBe('function')
    expect(typeof matchPattern).toBe('function')
    expect(typeof buildPath).toBe('function')
    expect(typeof parseQuery).toBe('function')
    expect(typeof validateSearch).toBe('function')
  })
})
