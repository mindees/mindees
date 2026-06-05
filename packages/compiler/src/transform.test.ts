import { describe, expect, it } from 'vitest'
import { compile, compileChecked } from './transform'
import type { MdcPlugin } from './types'

describe('compile — JSX → createElement', () => {
  it('lowers a JSX element to a createElement call', () => {
    const { code } = compile('export const a = <view id="x">hi</view>', { flatten: false })
    expect(code).toContain('createElement("view"')
    expect(code).toContain('id: "x"')
    expect(code).toContain('"hi"')
  })

  it('lowers a JSX fragment to Fragment', () => {
    const { code } = compile('export const a = <>{x}</>', { flatten: false })
    expect(code).toContain('createElement(Fragment')
  })

  it('emits a source map by default', () => {
    const { map } = compile('export const a = <view>hi</view>')
    expect(map).toBeDefined()
    expect(() => JSON.parse(map as string)).not.toThrow()
    expect(JSON.parse(map as string).mappings).toBeTypeOf('string')
  })

  it('omits the source map when disabled', () => {
    const { map } = compile('export const a = <view>hi</view>', { sourceMap: false })
    expect(map).toBeUndefined()
  })

  it('runs a user plugin after the built-in passes', () => {
    // Plugin that renames the identifier `OLD` → `NEW`.
    const rename: MdcPlugin = {
      name: 'rename',
      transformer: (ts) => (context: unknown) => {
        const ctx = context as import('typescript').TransformationContext
        return (sf: import('typescript').SourceFile) => {
          const visit = (node: import('typescript').Node): import('typescript').Node => {
            if (ts.isIdentifier(node) && node.text === 'OLD') {
              return ts.factory.createIdentifier('NEW')
            }
            return ts.visitEachChild(node, visit, ctx)
          }
          return ts.visitNode(sf, visit) as import('typescript').SourceFile
        }
      },
    }
    const { code } = compile('export const OLD = 1', { plugins: [rename] })
    expect(code).toContain('NEW')
    expect(code).not.toContain('OLD')
  })
})

describe('compileChecked — the gate refuses bad code', () => {
  it('emits code for valid input', () => {
    const result = compileChecked('export const a = 1')
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(result.code).toContain('const a = 1')
  })

  it('does NOT emit when there is a type error', () => {
    const result = compileChecked('export const a: number = "no"')
    expect(result.code).toBe('')
    expect(result.diagnostics.some((d) => d.code === 'TS2322')).toBe(true)
  })
})

describe('automatic JSX end-to-end (the framework component style compiles + runs)', () => {
  it('gate accepts an import-less component and emit injects the runtime import', () => {
    const src = 'export function App() {\n  return <view><text>hi</text></view>\n}\n'
    const result = compileChecked(src, { fileName: 'App.tsx', flatten: false })
    // The gate accepts idiomatic automatic JSX (no createElement import) — the headline bug.
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    // Emit binds the runtime via an injected @mindees/core import (no runtime ReferenceError).
    expect(result.code).toMatch(
      /import\s*\{[^}]*\bcreateElement\b[^}]*\}\s*from\s*["']@mindees\/core["']/,
    )
    // And it actually runs once the runtime is provided.
    const body = result.code
      .replace(/\bexport\s+/g, '')
      .replace(/^\s*import\b[^\n]*from\s*["']@mindees\/core["'];?\s*$/gm, '')
    const run = new Function('createElement', 'Fragment', `${body}\nreturn App()`) as (
      ce: (type: string, props: unknown, ...kids: unknown[]) => unknown,
      f: unknown,
    ) => unknown
    const el = run((type, props, ...kids) => ({ type, props, kids }), Symbol('Fragment'))
    expect(el).toEqual({
      type: 'view',
      props: null,
      kids: [{ type: 'text', props: null, kids: ['hi'] }],
    })
  })

  it('does not double-import when the component already imports createElement', () => {
    const src = "import { createElement } from '@mindees/core'\nexport const a = <view>hi</view>\n"
    const { code } = compile(src, { flatten: false })
    expect(code.match(/from\s*["']@mindees\/core["']/g)?.length).toBe(1)
  })
})
