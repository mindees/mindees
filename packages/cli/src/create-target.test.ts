import { describe, expect, it } from 'vitest'
import { quoteShellPath, resolveCreateTarget } from './create-target'

describe('resolveCreateTarget', () => {
  it('rejects Windows drive roots', () => {
    expect(resolveCreateTarget('C:\\').ok).toBe(false)
    expect(resolveCreateTarget('C:/').ok).toBe(false)
    expect(resolveCreateTarget('C:').ok).toBe(false)
  })
})

describe('quoteShellPath', () => {
  it('wraps display paths for copy-paste cd commands', () => {
    expect(quoteShellPath('My App!')).toBe('"My App!"')
    expect(quoteShellPath('E:/MiND/mindees-create-smoke')).toBe('"E:/MiND/mindees-create-smoke"')
  })
})
