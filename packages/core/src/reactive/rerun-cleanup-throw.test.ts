import { describe, expect, it } from 'vitest'
import { createRoot, effect, onCleanup, signal } from './reactive'

// Regression: when an effect re-runs, it first tears down the previous run
// (disposing owned children and running cleanups). If a cleanup throws, that
// must NOT abort the re-track + recompute — otherwise the effect stays alive but
// silently loses its owned children and dynamic dependencies until some unrelated
// later change happens to re-run it. The error must still surface, but only after
// the effect has rebuilt a consistent graph.
describe('a prior-run cleanup that throws during re-run', () => {
  it('still rebuilds the effect children + dynamic deps, then surfaces the error', () => {
    const a = signal(0)
    const inner = signal(100)
    const seen: number[] = []
    createRoot(() => {
      effect(() => {
        a() // dynamic dependency
        effect(() => seen.push(inner())) // owned child effect
        onCleanup(() => {
          if (a.peek() === 1) throw new Error('boom')
        })
      })
    })
    expect(seen).toEqual([100])

    // Re-running the outer effect tears down the prior run first; that cleanup
    // throws. The error surfaces to the writer...
    expect(() => a.set(1)).toThrow('boom')

    // ...but the outer effect must STILL have rebuilt its inner child, so it
    // keeps reacting (pre-fix the child was orphaned and this stayed stale).
    inner.set(200)
    expect(seen.at(-1)).toBe(200)
  })
})
