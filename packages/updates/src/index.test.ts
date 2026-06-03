import { describe, expect, it } from 'vitest'
import {
  createWasmModuleRuntime,
  info,
  maturity,
  NotImplementedError,
  name,
  VERSION,
} from './index'

describe('@mindees/updates metadata', () => {
  it('exposes honest package metadata', () => {
    expect(name).toBe('@mindees/updates')
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
    expect(maturity).toBe('experimental')
    expect(info).toEqual({ name: '@mindees/updates', version: VERSION, maturity: 'experimental' })
  })

  it('the WASM module runtime is a research track that throws (not a silent stub)', () => {
    expect(() => createWasmModuleRuntime()).toThrow(NotImplementedError)
  })
})
