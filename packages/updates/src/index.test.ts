import { describe, expect, it } from 'vitest'
import { createWasmModuleRuntime, info, maturity, name, VERSION } from './index'

describe('@mindees/updates metadata', () => {
  it('exposes honest package metadata', () => {
    expect(name).toBe('@mindees/updates')
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
    expect(maturity).toBe('experimental')
    expect(info).toEqual({ name: '@mindees/updates', version: VERSION, maturity: 'experimental' })
  })

  it('info is frozen so its self-reported identity cannot be mutated at runtime', () => {
    expect(Object.isFrozen(info)).toBe(true)
    expect(() => {
      ;(info as { version: string }).version = '9.9.9'
    }).toThrow()
    expect(info.version).toBe(VERSION)
  })

  it('the WASM module runtime is implemented (returns a runtime with instantiate)', () => {
    const runtime = createWasmModuleRuntime()
    expect(typeof runtime.instantiate).toBe('function')
  })
})
