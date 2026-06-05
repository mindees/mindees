import { describe, expect, it } from 'vitest'
import { hasErrors, typecheck } from './typecheck'

describe('typecheck (the gate)', () => {
  it('reports no diagnostics for valid code', () => {
    const diags = typecheck('const n: number = 1; export { n }')
    expect(diags).toEqual([])
    expect(hasErrors(diags)).toBe(false)
  })

  it('accepts a realistic component module (imported factory + intrinsic JSX)', () => {
    const diags = typecheck(
      'import { createElement } from \'@mindees/core\'\nexport const App = () => <view id="x"><text>hi</text></view>',
    )
    // Imports are not resolved by the single-module gate (TS2307 filtered), and
    // intrinsic JSX type-checks via the ambient JSX lib — so no errors.
    expect(diags.filter((d) => d.severity === 'error')).toEqual([])
  })

  it('still reports genuine type errors (the gate is not disabled)', () => {
    const diags = typecheck('export const n: number = "no"')
    expect(diags.some((d) => d.code === 'TS2322')).toBe(true)
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

  it('type-checks idiomatic automatic-JSX with no import (the runtime is configured)', () => {
    // The framework ships automatic JSX: a component imports NOTHING, yet JSX resolves
    // through `@mindees/core/jsx-runtime`'s `JSX` namespace. So this is valid — not the old
    // "cannot find name 'createElement'" error that broke the framework's own component style.
    const diags = typecheck('export const a = <view>hi</view>')
    expect(diags.filter((d) => d.severity === 'error')).toEqual([])
    // It's parsed + semantically checked (no syntactic TS1xxx parse failures).
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
    // The same source in `.tsx` is valid JSX under the automatic runtime → no errors.
    const tsxDiags = typecheck('export const a = <view />', 'module.tsx')
    expect(tsxDiags.filter((d) => d.severity === 'error')).toEqual([])
  })

  it('enforces strict flags (noUncheckedIndexedAccess)', () => {
    const src = 'export function f(a: string[]): string { return a[0] }' // a[0] is string | undefined
    const diags = typecheck(src)
    expect(hasErrors(diags)).toBe(true)
  })
})
