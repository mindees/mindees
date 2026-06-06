import { describe, expect, it } from 'vitest'
import { checkBudget } from './budget'
import { compileChecked } from './transform'
import { hasErrors } from './typecheck'

const SRC = 'export const v = <view><text>a</text><text>b</text></view>' // 3 elements

describe('performance budget', () => {
  it('compiles normally when no budget is set', () => {
    const r = compileChecked(SRC)
    expect(r.code.length).toBeGreaterThan(0)
    expect(r.diagnostics.some((d) => d.code.startsWith('MDC_BUDGET'))).toBe(false)
  })

  it('passes within budget', () => {
    const r = compileChecked(SRC, { budget: { maxElements: 10, maxBytes: 100_000 } })
    expect(r.code.length).toBeGreaterThan(0)
    expect(r.diagnostics.some((d) => d.code.startsWith('MDC_BUDGET'))).toBe(false)
  })

  it('FAILS the build (refuses to emit) when the element budget is exceeded', () => {
    const r = compileChecked(SRC, { budget: { maxElements: 2 } })
    const diag = r.diagnostics.find((d) => d.code === 'MDC_BUDGET_ELEMENTS')
    expect(diag?.severity).toBe('error')
    expect(diag?.file).toBe('module.tsx')
    expect(hasErrors(r.diagnostics)).toBe(true)
    expect(r.code).toBe('') // refused to emit
  })

  it('FAILS the build when the byte budget is exceeded', () => {
    const r = compileChecked(SRC, { budget: { maxBytes: 5 } })
    expect(r.diagnostics.some((d) => d.code === 'MDC_BUDGET_BYTES' && d.severity === 'error')).toBe(
      true,
    )
    expect(r.code).toBe('')
  })

  it('checkBudget reports each exceeded limit (and nothing within budget)', () => {
    const within = checkBudget(
      { code: 'abc', stats: { flattenedNodes: 0, totalElements: 1 } },
      {
        maxBytes: 10,
        maxElements: 5,
      },
    )
    expect(within).toHaveLength(0)
    const over = checkBudget(
      { code: 'abcdef', stats: { flattenedNodes: 0, totalElements: 9 } },
      {
        maxBytes: 3,
        maxElements: 5,
      },
    )
    expect(over.map((d) => d.code).sort()).toEqual(['MDC_BUDGET_BYTES', 'MDC_BUDGET_ELEMENTS'])
  })
})
