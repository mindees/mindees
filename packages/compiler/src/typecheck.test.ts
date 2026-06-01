import { describe, expect, it } from 'vitest'
import { hasErrors, typecheck } from './typecheck'

describe('typecheck (the gate)', () => {
  it('reports no diagnostics for valid code', () => {
    const diags = typecheck('const n: number = 1; export { n }')
    expect(diags).toEqual([])
    expect(hasErrors(diags)).toBe(false)
  })

  it('catches a type error and reports a TS code + position', () => {
    const diags = typecheck('const n: number = "nope"')
    expect(hasErrors(diags)).toBe(true)
    const err = diags.find((d) => d.severity === 'error')
    expect(err).toBeDefined()
    expect(err?.code).toMatch(/^TS\d+$/)
    expect(err?.code).toBe('TS2322') // not assignable
    expect(err?.position?.line).toBe(1)
  })

  it('catches an undefined-variable error', () => {
    const diags = typecheck('export const x = doesNotExist + 1')
    expect(hasErrors(diags)).toBe(true)
    expect(diags.some((d) => d.code === 'TS2304')).toBe(true) // cannot find name
  })

  it('catches a syntactic error', () => {
    const diags = typecheck('const = ')
    expect(hasErrors(diags)).toBe(true)
  })

  it('parses + type-checks TSX (JSX is configured, not a syntax error)', () => {
    // The JSX factory (`createElement`) isn't in scope here, so the checker
    // reports factory/intrinsic-element diagnostics — proving JSX is parsed and
    // semantically checked rather than failing to parse.
    const diags = typecheck('export const a = <view>hi</view>')
    expect(diags.length).toBeGreaterThan(0)
    // The missing JSX factory shows up as "cannot find name 'createElement'".
    expect(diags.some((d) => d.code === 'TS2552' || d.code === 'TS2304')).toBe(true)
    // None are syntactic parse failures (those are TS1xxx).
    expect(diags.every((d) => !/^TS1\d{3}$/.test(d.code))).toBe(true)
  })

  it('catches a genuinely-undefined reference inside TSX (TS2304)', () => {
    const diags = typecheck('export const a = <view>{definitelyNotDefined}</view>')
    expect(diags.some((d) => d.code === 'TS2304')).toBe(true)
  })

  it('derives ScriptKind from the extension: a .ts file does not parse JSX as TSX', () => {
    // ScriptKind comes from the file name. `<view />` in a `.ts` file is not a
    // valid element (it would be a malformed type-assertion), so it errors
    // differently than the same source in a `.tsx` file.
    const tsDiags = typecheck('export const a = <view />', 'module.ts')
    expect(tsDiags.length).toBeGreaterThan(0)
    const tsxDiags = typecheck('export const a = <view />', 'module.tsx')
    expect(tsxDiags.some((d) => d.code === 'TS2552' || d.code === 'TS2304')).toBe(true)
  })

  it('enforces strict flags (noUncheckedIndexedAccess)', () => {
    const src = 'export function f(a: string[]): string { return a[0] }' // a[0] is string | undefined
    const diags = typecheck(src)
    expect(hasErrors(diags)).toBe(true)
  })
})
