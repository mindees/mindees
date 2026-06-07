import { describe, expect, it } from 'vitest'
import { createRoot, effect, on, signal } from '../index'

describe('on', () => {
  it('reacts only to the explicit dep, not to signals read in the body', () => {
    createRoot(() => {
      const a = signal(0)
      const b = signal(0)
      const runs: number[] = []
      effect(
        on(
          () => a(),
          (av) => {
            b() // read in body — must NOT subscribe
            runs.push(av)
          },
        ),
      )
      expect(runs).toEqual([0]) // initial run
      b.set(1) // not a tracked dep → no re-run
      expect(runs).toEqual([0])
      a.set(5) // tracked dep → re-run
      expect(runs).toEqual([0, 5])
    })
  })

  it('passes current and previous dep values', () => {
    createRoot(() => {
      const a = signal('x')
      const seen: Array<[string, string | undefined]> = []
      effect(
        on(
          () => a(),
          (cur, prev) => seen.push([cur, prev]),
        ),
      )
      a.set('y')
      a.set('z')
      expect(seen).toEqual([
        ['x', undefined],
        ['y', 'x'],
        ['z', 'y'],
      ])
    })
  })

  it('defer skips the first run but still tracks the dep', () => {
    createRoot(() => {
      const a = signal(0)
      const runs: number[] = []
      effect(
        on(
          () => a(),
          (av) => runs.push(av),
          { defer: true },
        ),
      )
      expect(runs).toEqual([]) // deferred — no initial run
      a.set(1)
      expect(runs).toEqual([1])
      a.set(2)
      expect(runs).toEqual([1, 2])
    })
  })
})
