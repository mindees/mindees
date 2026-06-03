import { describe, expect, it } from 'vitest'
import { compile } from './transform'

/** Compile with flattening on and return code + stats. */
function flat(src: string) {
  return compile(src, { flatten: true, sourceMap: false })
}

describe('tree-flattening', () => {
  it('wraps a fully-static element subtree in the static marker once', () => {
    const { code, stats } = flat('export const a = <view id="x"><text>hi</text></view>')
    expect(code).toContain('_static(createElement("view"')
    // exactly one wrap (the outermost static root), not one per nested element
    expect(code.match(/_static\(/g)?.length).toBe(1)
    expect(stats.flattenedNodes).toBe(1)
    expect(stats.totalElements).toBe(2) // view + text
  })

  it('emits self-contained, RUNNABLE code (defines the _static marker)', () => {
    const { code } = flat('export const a = <view id="x"><text>hi</text></view>')
    // The marker is hoisted into the module, so output never throws
    // "ReferenceError: _static is not defined" at runtime.
    expect(code).toContain('const _static =')
    const body = code.replace(/\bexport\s+/g, '')
    const run = new Function('createElement', `${body}\nreturn a`) as (
      createElement: (type: string, props: unknown, ...kids: unknown[]) => unknown,
    ) => unknown
    const el = run((type, props, ...kids) => ({ type, props, kids }))
    // _static is identity, so the result is exactly the createElement tree.
    expect(el).toEqual({
      type: 'view',
      props: { id: 'x' },
      kids: [{ type: 'text', props: null, kids: ['hi'] }],
    })
  })

  it('does not inject the marker when nothing is flattened', () => {
    const { code } = flat('export const a = (n) => <view>{n}</view>')
    expect(code).not.toContain('const _static =')
  })

  it('does NOT flatten an element with a dynamic child', () => {
    const { code, stats } = flat('export const a = (n) => <view>{n}</view>')
    expect(code).not.toContain('_static(')
    expect(stats.flattenedNodes).toBe(0)
    expect(stats.totalElements).toBe(1)
  })

  it('does NOT flatten an element with a dynamic prop', () => {
    const { code, stats } = flat('export const a = (cls) => <view class={cls}>hi</view>')
    expect(code).not.toContain('_static(')
    expect(stats.flattenedNodes).toBe(0)
  })

  it('flattens multiple independent static roots', () => {
    const { stats } = flat('export const a = <view>1</view>; export const b = <text>2</text>')
    expect(stats.flattenedNodes).toBe(2)
    expect(stats.totalElements).toBe(2)
  })

  it('flattens the static root but counts all nested elements', () => {
    const src = 'export const a = <a><b><c>x</c></b></a>'
    const { code, stats } = flat(src)
    expect(code.match(/_static\(/g)?.length).toBe(1) // only the outer <a>
    expect(stats.flattenedNodes).toBe(1)
    expect(stats.totalElements).toBe(3) // a + b + c
  })

  it('can be disabled', () => {
    const { code, stats } = compile('export const a = <view>hi</view>', {
      flatten: false,
      sourceMap: false,
    })
    expect(code).not.toContain('_static(')
    expect(stats.flattenedNodes).toBe(0)
  })

  it('partially flattens: static subtree inside a dynamic parent', () => {
    // Outer <view> has a dynamic child {n}, so it is NOT static; the inner
    // <footer> static subtree is also a child of the dynamic region, so the
    // outer is not wrapped. The inner static element, appearing as a sibling
    // argument, IS a static root and gets wrapped.
    const src = 'export const a = (n) => <view>{n}<footer><span>©</span></footer></view>'
    const { code, stats } = flat(src)
    expect(stats.totalElements).toBe(3) // view + footer + span
    expect(code.match(/_static\(/g)?.length).toBe(1) // the <footer> subtree
    expect(stats.flattenedNodes).toBe(1)
  })
})
