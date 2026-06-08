import { describe, expect, it } from 'vitest'
import { createRoot, effect, getOwner, runWithOwner, signal } from '../reactive'
import { createContext, provideContext, useContext } from './component'

describe('tree-scoped context (provideContext / useContext)', () => {
  it('returns the default value when nothing was provided', () => {
    const Ctx = createContext('default')
    createRoot(() => {
      expect(useContext(Ctx)).toBe('default')
    })
  })

  it('provides a value to a nested scope', () => {
    const Ctx = createContext('default')
    let seen = ''
    createRoot(() => {
      provideContext(Ctx, 'provided')
      // A nested effect (a child scope) reads via the parent chain.
      effect(() => {
        seen = useContext(Ctx)
      })
    })
    expect(seen).toBe('provided')
  })

  it('lets the nearest provider shadow an outer one', () => {
    const Ctx = createContext('default')
    const seen: string[] = []
    createRoot(() => {
      provideContext(Ctx, 'outer')
      effect(() => {
        provideContext(Ctx, 'inner')
        effect(() => seen.push(useContext(Ctx))) // sees 'inner'
      })
      effect(() => seen.push(useContext(Ctx))) // sibling of the inner provider → sees 'outer'
    })
    expect(seen).toContain('inner')
    expect(seen).toContain('outer')
  })

  it('delivers a reactive accessor so descendants track changes (the overlay-in-tab shape)', () => {
    const Visible = createContext<() => boolean>(() => true)
    const active = signal(0)
    const reads: boolean[] = []
    createRoot(() => {
      // An outer region provides a reactive "is tab 1 active?" accessor...
      provideContext(Visible, () => active() === 1)
      // ...a deeply nested region reads it and reactively tracks it.
      effect(() => {
        const visible = useContext(Visible)
        reads.push(visible())
      })
    })
    expect(reads).toEqual([false]) // active=0 → tab 1 not visible
    active.set(1)
    expect(reads).toEqual([false, true]) // re-ran with the new value
  })

  it('clears a conditionally-provided value when the scope re-runs (no stale leak)', () => {
    const Ctx = createContext('default')
    const provide = signal(true)
    const seen: string[] = []
    createRoot(() => {
      effect(() => {
        if (provide()) provideContext(Ctx, 'on')
        effect(() => seen.push(useContext(Ctx)))
      })
    })
    expect(seen).toEqual(['on'])
    provide.set(false) // outer effect re-runs WITHOUT providing → context must reset to default
    expect(seen).toEqual(['on', 'default'])
  })

  it('is a no-op outside any reactive scope', () => {
    const Ctx = createContext('default')
    expect(() => provideContext(Ctx, 'x')).not.toThrow()
    expect(useContext(Ctx)).toBe('default')
  })

  it('a DISPOSED root scope no longer provides context (re-entry → default, not stale)', () => {
    const Ctx = createContext('DEFAULT')
    let captured: ReturnType<typeof getOwner> = null
    const dispose = createRoot((d) => {
      provideContext(Ctx, 'PROVIDED')
      createRoot(() => {
        captured = getOwner() // a captured child scope (e.g. for deferred work)
      })
      return d
    })
    expect(runWithOwner(captured, () => useContext(Ctx))).toBe('PROVIDED') // live
    dispose() // the provider scope is torn down
    expect(runWithOwner(captured, () => useContext(Ctx))).toBe('DEFAULT') // not a stale 'PROVIDED'
  })

  it('a DISPOSED effect scope releases its provided context', () => {
    const Ctx = createContext('DEFAULT')
    let captured: ReturnType<typeof getOwner> = null
    const dispose = createRoot((d) => {
      effect(() => {
        provideContext(Ctx, 'E')
        captured = getOwner() // the effect's own scope
      })
      return d
    })
    expect(runWithOwner(captured, () => useContext(Ctx))).toBe('E')
    dispose() // disposes the effect → its contexts map is cleared
    expect(runWithOwner(captured, () => useContext(Ctx))).toBe('DEFAULT')
  })
})
