import { describe, expect, it } from 'vitest'
import { computed, createRoot, effect, signal } from './reactive'

// Regression: a computation that writes a signal it ALSO reads ("self-write").
// Previously the staleness mark was dropped — the node was already DIRTY mid-run,
// so markStale was a no-op and the node settled CLEAN holding a value derived
// from the now-stale signal. It must instead recompute until its own writes
// settle (bounded by the infinite-loop guard), honoring the contract that a
// computation reflects its dependencies' latest values.
describe('self-write: a computation that writes a signal it reads', () => {
  it('re-runs an effect until its own writes settle', () => {
    const a = signal(0)
    const seen: number[] = []
    createRoot(() => {
      effect(() => {
        const v = a()
        seen.push(v)
        if (v < 3) a.set(v + 1)
      })
    })
    expect(seen).toEqual([0, 1, 2, 3])
    expect(a()).toBe(3)
  })

  it('a computed converges on the value it just produced (no stale cache)', () => {
    const b = signal(0)
    const c = computed(() => {
      const v = b()
      if (v < 1) b.set(v + 1)
      return v
    })
    expect(c()).toBe(1) // first read drives b to 1 and immediately reflects it
    expect(b()).toBe(1)
  })

  it('notifies other observers of each value a self-write commits (glitch-free)', () => {
    const a = signal(0)
    const mirror: number[] = []
    createRoot(() => {
      effect(() => mirror.push(a())) // observer created first
      effect(() => {
        // self-writer created second
        const v = a()
        if (v < 3) a.set(v + 1)
      })
    })
    expect(mirror).toEqual([0, 1, 2, 3])
  })

  it('throws on a non-terminating self-writer instead of hanging', () => {
    const a = signal(0)
    expect(() =>
      createRoot(() => {
        effect(() => {
          a.set(a() + 1) // never stops writing a signal it reads
        })
      }),
    ).toThrow(/infinite reactive loop/)
  })
})
