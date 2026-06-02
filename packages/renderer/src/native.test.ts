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

  it('the error names the feature as a research track (no spurious RFC reference)', () => {
    try {
      createNativeBackend('ios')
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(NotImplementedError)
      expect((err as NotImplementedError).feature).toContain('Native')
      // No tracking RFC exists for this research track yet — must not cite a wrong one.
      expect((err as NotImplementedError).rfc).toBeUndefined()
    }
  })
})
