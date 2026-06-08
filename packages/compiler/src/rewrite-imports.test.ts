import { describe, expect, it } from 'vitest'
import { rewriteImportSpecifiers } from './rewrite-imports'

// A resolver mirroring the CLI's: add `.js` to extensionless relative specifiers (no directory map here).
const addJs = (spec: string): string => (/\.[a-zA-Z0-9]+$/.test(spec) ? spec : `${spec}.js`)

describe('rewriteImportSpecifiers (AST-based)', () => {
  it('rewrites static import/export-from relative specifiers, leaves bare ones', () => {
    const code = [
      "import { App } from './App'",
      "import { render } from '@mindees/renderer'",
      "export { x } from '../lib/x'",
      "export * from './all'",
    ].join('\n')
    const out = rewriteImportSpecifiers(code, addJs)
    expect(out).toContain("from './App.js'")
    expect(out).toContain("from '@mindees/renderer'") // bare untouched
    expect(out).toContain("from '../lib/x.js'")
    expect(out).toContain("export * from './all.js'")
  })

  it('rewrites a dynamic import with a STRING-LITERAL arg', () => {
    expect(rewriteImportSpecifiers("const m = import('./lazy')", addJs)).toContain(
      "import('./lazy.js')",
    )
  })

  it('does NOT corrupt a concatenated dynamic import (non-literal arg)', () => {
    const code = "const m = import('./pages/' + name)"
    expect(rewriteImportSpecifiers(code, addJs)).toBe(code) // unchanged — the arg is not a single literal
  })

  it('does NOT touch import-like text inside a string literal', () => {
    const code = `const s = "import x from './snippet'"`
    expect(rewriteImportSpecifiers(code, addJs)).toBe(code)
  })

  it('leaves specifiers that already have an extension', () => {
    const code = "import data from './app.config.json'\nimport './styles.css'"
    expect(rewriteImportSpecifiers(code, addJs)).toBe(code)
  })

  it('honors a directory-aware resolver (→ /index.js)', () => {
    const resolve = (spec: string): string =>
      spec === './widgets' ? './widgets/index.js' : addJs(spec)
    const out = rewriteImportSpecifiers("import { W } from './widgets'", resolve)
    expect(out).toContain("from './widgets/index.js'")
  })

  it('returns the original string when nothing changes', () => {
    const code = "import { a } from '@mindees/core'"
    expect(rewriteImportSpecifiers(code, addJs)).toBe(code)
  })
})
