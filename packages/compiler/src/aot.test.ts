import { NotImplementedError } from '@mindees/core'
import { describe, expect, it } from 'vitest'
import { compileToNative } from './aot'

describe('compileToNative (research track)', () => {
  it('throws NotImplementedError (honest, not a silent stub)', () => {
    expect(() => compileToNative('export const a = 1', 'arm64')).toThrow(NotImplementedError)
    expect(() => compileToNative('export const a = 1', 'x86-64')).toThrow(NotImplementedError)
  })

  it('names the feature and references an RFC', () => {
    try {
      compileToNative('', 'arm64')
      expect.unreachable('should throw')
    } catch (err) {
      expect(err).toBeInstanceOf(NotImplementedError)
      expect((err as NotImplementedError).feature).toContain('native')
      expect((err as NotImplementedError).rfc).toBe('RFC-0001')
    }
  })
})
