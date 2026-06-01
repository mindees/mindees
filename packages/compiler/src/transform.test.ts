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
