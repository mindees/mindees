import { describe, expect, it, vi } from 'vitest'
import { effect } from '../reactive'
import { createContext, createProvider } from './component'

describe('context', () => {
  it('provides the default value when not set', () => {
    const Theme = createContext({ mode: 'light' })
    const p = createProvider(Theme)
    expect(p.peek()).toEqual({ mode: 'light' })
  })

  it('select() reads the current slice', () => {
    const Theme = createContext({ mode: 'light', accent: 'blue' })
    const p = createProvider(Theme)
    const mode = p.select((t) => t.mode)
    expect(mode()).toBe('light')
    p.set({ mode: 'dark', accent: 'blue' })
    expect(mode()).toBe('dark')
  })

  it('RE-RENDER ISOLATION: a consumer only re-runs when its slice changes', () => {
    const Ctx = createContext({ user: { name: 'a' }, count: 0 })
    const p = createProvider(Ctx)

    const name = p.select((c) => c.user.name)
    const count = p.select((c) => c.count)

    const nameRuns = vi.fn()
    const countRuns = vi.fn()
    effect(() => {
      name()
      nameRuns()
    })
    effect(() => {
      count()
      countRuns()
    })
    expect(nameRuns).toHaveBeenCalledTimes(1)
    expect(countRuns).toHaveBeenCalledTimes(1)

    // Change ONLY count → only the count consumer re-runs.
    p.set({ user: { name: 'a' }, count: 1 })
    expect(countRuns).toHaveBeenCalledTimes(2)
    expect(nameRuns).toHaveBeenCalledTimes(1) // isolated — did NOT re-run

    // Change ONLY name → only the name consumer re-runs.
    p.set({ user: { name: 'b' }, count: 1 })
    expect(nameRuns).toHaveBeenCalledTimes(2)
    expect(countRuns).toHaveBeenCalledTimes(2) // isolated
  })

  it('uses Object.is by default and a custom equals when given', () => {
    const Ctx = createContext({ items: [1, 2, 3] })
    const p = createProvider(Ctx)

    // default Object.is: a new array reference is "changed"
    const byRef = p.select((c) => c.items)
    const refRuns = vi.fn()
    effect(() => {
      byRef()
      refRuns()
    })
    expect(refRuns).toHaveBeenCalledTimes(1)
    p.set({ items: [1, 2, 3] }) // new ref, same contents
    expect(refRuns).toHaveBeenCalledTimes(2) // Object.is sees a change

    // custom equals: structural → no re-run when contents equal
    const byLen = p.select(
      (c) => c.items,
      (a, b) => a.length === b.length && a.every((v, i) => v === b[i]),
    )
    const lenRuns = vi.fn()
    effect(() => {
      byLen()
      lenRuns()
    })
    expect(lenRuns).toHaveBeenCalledTimes(1)
    p.set({ items: [1, 2, 3] }) // equal by comparator
    expect(lenRuns).toHaveBeenCalledTimes(1) // isolated by custom equals
  })

  it('derived selects compose (select of a computed field)', () => {
    const Ctx = createContext({ first: 'Ada', last: 'Lovelace' })
    const p = createProvider(Ctx)
    const full = p.select((c) => `${c.first} ${c.last}`)
    expect(full()).toBe('Ada Lovelace')
    const runs = vi.fn()
    effect(() => {
      full()
      runs()
    })
    p.set({ first: 'Ada', last: 'Lovelace' }) // same derived string
    expect(runs).toHaveBeenCalledTimes(1) // string equal → isolated
    p.set({ first: 'Grace', last: 'Hopper' })
    expect(runs).toHaveBeenCalledTimes(2)
  })
})
