import { NotImplementedError } from '@mindees/core'
import { describe, expect, it } from 'vitest'
import { createCanvasBackend, createNativeBackend } from './native'

describe('native + canvas backends (research tracks)', () => {
  it('createNativeBackend throws NotImplementedError (honest, not a silent stub)', () => {
    expect(() => createNativeBackend('ios')).toThrow(NotImplementedError)
    expect(() => createNativeBackend('android')).toThrow(NotImplementedError)
  })

  it('createCanvasBackend throws NotImplementedError', () => {
    expect(() => createCanvasBackend()).toThrow(NotImplementedError)
  })

  it('the error names the feature and references an RFC', () => {
    try {
      createNativeBackend('ios')
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(NotImplementedError)
      expect((err as NotImplementedError).feature).toContain('Native')
      expect((err as NotImplementedError).rfc).toBe('RFC-0001')
    }
  })
})
