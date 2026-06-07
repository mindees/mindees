import { describe, expect, it } from 'vitest'
import { quoteShellPath, resolveCreateTarget } from './create-target'

describe('resolveCreateTarget', () => {
  it('rejects Windows drive roots', () => {
    expect(resolveCreateTarget('C:\\').ok).toBe(false)
    expect(resolveCreateTarget('C:/').ok).toBe(false)
    expect(resolveCreateTarget('C:').ok).toBe(false)
  })

  it('rejects UNC paths instead of silently collapsing the share root', () => {
    expect(resolveCreateTarget('\\\\server\\share\\app').ok).toBe(false)
    expect(resolveCreateTarget('//server/share/app').ok).toBe(false)
  })
})

describe('quoteShellPath', () => {
  it('single-quotes display paths for copy-paste cd commands (POSIX-literal)', () => {
    expect(quoteShellPath('My App!')).toBe("'My App!'")
    expect(quoteShellPath('E:/MiND/mindees-create-smoke')).toBe("'E:/MiND/mindees-create-smoke'")
  })

  it('neutralizes shell metacharacters so a pasted cd cannot run a command', () => {
    // Inside single quotes, $(...) / backticks / $VAR / \\ are all literal.
    expect(quoteShellPath('app$(id)')).toBe("'app$(id)'")
    expect(quoteShellPath("a'b")).toBe("'a'\\''b'") // embedded quote: close, escape, reopen
  })

  it('rejects illegal colon paths but allows a drive-letter path', () => {
    expect(resolveCreateTarget('C:foo', 'D:/work').ok).toBe(false) // drive-relative
    expect(resolveCreateTarget('app:1.0', 'D:/work').ok).toBe(false) // versioned name
    expect(resolveCreateTarget('foo:bar', 'D:/work').ok).toBe(false) // mid-string colon
    expect(resolveCreateTarget('C:/Users/app').ok).toBe(true) // a real drive path still works
  })
})
