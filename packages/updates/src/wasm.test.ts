import { describe, expect, it } from 'vitest'
import { UpdateError } from './errors'
import { createWasmModuleRuntime } from './wasm'

// (module (func (export "add") (param i32 i32) (result i32) local.get 0 local.get 1 i32.add))
const ADD = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01,
  0x7f, 0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00, 0x0a, 0x09,
  0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b,
])

// (module (import "host" "inc" (func (param i32) (result i32)))
//         (func (export "run") (param i32) (result i32) local.get 0 call 0))
const NEEDS_HOST = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x06, 0x01, 0x60, 0x01, 0x7f, 0x01, 0x7f,
  0x02, 0x0c, 0x01, 0x04, 0x68, 0x6f, 0x73, 0x74, 0x03, 0x69, 0x6e, 0x63, 0x00, 0x00, 0x03, 0x02,
  0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x72, 0x75, 0x6e, 0x00, 0x01, 0x0a, 0x08, 0x01, 0x06, 0x00,
  0x20, 0x00, 0x10, 0x00, 0x0b,
])

describe('createWasmModuleRuntime', () => {
  it('instantiates a pure module and calls an export', async () => {
    const rt = createWasmModuleRuntime()
    const mod = await rt.instantiate(ADD)
    expect(mod.call<number>('add', 2, 3)).toBe(5)
    expect(typeof mod.exports.add).toBe('function')
  })

  it('is capability-secure: a module gets ONLY the capabilities granted', async () => {
    const rt = createWasmModuleRuntime()
    // Granted the host.inc capability → runs.
    const mod = await rt.instantiate(NEEDS_HOST, { host: { inc: (n: number) => n + 1 } })
    expect(mod.call<number>('run', 41)).toBe(42)
    // NOT granted → instantiation is refused (sandbox: it can't reach anything ambient).
    await expect(rt.instantiate(NEEDS_HOST)).rejects.toMatchObject({ code: 'MODULE_INVALID' })
  })

  it('rejects malformed bytecode with MODULE_INVALID', async () => {
    const rt = createWasmModuleRuntime()
    await expect(rt.instantiate(new Uint8Array([1, 2, 3, 4]))).rejects.toBeInstanceOf(UpdateError)
  })

  it('rejects an oversized module', async () => {
    const rt = createWasmModuleRuntime({ maxBytes: 8 })
    await expect(rt.instantiate(ADD)).rejects.toMatchObject({ code: 'MODULE_INVALID' })
  })

  it('throws MODULE_INVALID when calling a missing export', async () => {
    const rt = createWasmModuleRuntime()
    const mod = await rt.instantiate(ADD)
    expect(() => mod.call('nope')).toThrow(/no exported function/)
  })
})
