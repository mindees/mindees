import { describe, expect, it } from 'vitest'
import { toA11yProps } from './a11y'
import { flattenStyle } from './style'

describe('flattenStyle', () => {
  it('returns a single object unchanged (cloned)', () => {
    const input = { width: 10, color: 'red' }
    const out = flattenStyle(input)
    expect(out).toEqual(input)
    expect(out).not.toBe(input)
  })

  it('merges an array, later entries winning, dropping falsy', () => {
    expect(flattenStyle([{ color: 'red', width: 10 }, false, null, { color: 'blue' }])).toEqual({
      color: 'blue',
      width: 10,
    })
  })

  it('flattens nested arrays', () => {
    expect(flattenStyle([{ a: 1 } as never, [{ b: 2 } as never, [{ c: 3 } as never]]])).toEqual({
      a: 1,
      b: 2,
      c: 3,
    })
  })

  it('treats false/null/undefined as empty', () => {
    expect(flattenStyle(false)).toEqual({})
    expect(flattenStyle(null)).toEqual({})
    expect(flattenStyle(undefined)).toEqual({})
  })
})

describe('toA11yProps', () => {
  it('lowers role/label/describedBy/live', () => {
    expect(
      toA11yProps({ role: 'button', label: 'Save', describedBy: 'd1', live: 'polite' }),
    ).toEqual({
      role: 'button',
      'aria-label': 'Save',
      'aria-describedby': 'd1',
      'aria-live': 'polite',
    })
  })

  it('lowers state to aria-* (only defined keys)', () => {
    expect(toA11yProps({ state: { disabled: true, checked: false } })).toEqual({
      'aria-disabled': 'true',
      'aria-checked': 'false',
    })
  })

  it('omits everything when nothing is set', () => {
    expect(toA11yProps({})).toEqual({})
  })
})
