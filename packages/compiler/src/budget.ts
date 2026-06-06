/**
 * Build-time **performance budgets** (spec §12: "the compiler fails the build if a screen exceeds
 * configured … bundle-size budgets — so '100% optimized' is enforced, not aspirational"). Unlike the
 * perf-lint (warnings), a budget violation is an **error** that refuses to emit — neither React Native
 * nor Flutter enforces a perf budget at build time.
 *
 * @module
 */

import type { CompileResult, Diagnostic } from './types'

/** A per-module performance budget. A field left undefined isn't enforced. */
export interface BudgetOptions {
  /** Max compiled output size in **bytes** (UTF-8). */
  readonly maxBytes?: number
  /** Max total elements in the module's UI tree (pre-flatten count). */
  readonly maxElements?: number
}

/** UTF-8 byte length of `text` (platform-neutral; no `Buffer`). */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

/**
 * Check a compile result against `budget`. Returns **error** diagnostics for every exceeded limit
 * (empty when within budget). `compileChecked` refuses to emit when any are present.
 */
export function checkBudget(
  result: Pick<CompileResult, 'code' | 'stats'>,
  budget: BudgetOptions,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  if (budget.maxBytes !== undefined) {
    const bytes = byteLength(result.code)
    if (bytes > budget.maxBytes) {
      diagnostics.push({
        severity: 'error',
        code: 'MDC_BUDGET_BYTES',
        message: `Bundle size ${bytes} B exceeds the budget of ${budget.maxBytes} B (over by ${bytes - budget.maxBytes} B). Split the screen, lazy-load, or raise the budget.`,
      })
    }
  }
  if (budget.maxElements !== undefined && result.stats.totalElements > budget.maxElements) {
    diagnostics.push({
      severity: 'error',
      code: 'MDC_BUDGET_ELEMENTS',
      message: `${result.stats.totalElements} UI elements exceed the budget of ${budget.maxElements}. Virtualize long lists (List/For) or split the screen.`,
    })
  }
  return diagnostics
}
