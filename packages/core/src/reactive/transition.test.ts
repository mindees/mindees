import { afterEach, describe, expect, it } from 'vitest'
import { createScheduler } from '../scheduler'
import {
  createRoot,
  deferred,
  effect,
  setReactiveScheduler,
  signal,
  startTransition,
} from './index'

const manualScheduler = () => createScheduler({ scheduleMicrotask: () => {} })

describe('startTransition', () => {
  afterEach(() => setReactiveScheduler(null))

  it('applies writes immediately but defers the invalidated effects (with a scheduler)', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const q = signal('')
    const ran: string[] = []
    effect(() => ran.push(q())) // a PLAIN sync effect — normally runs synchronously
    expect(ran).toEqual([''])

    startTransition(() => q.set('abc'))
    expect(q()).toBe('abc') // the write applied immediately (eager read)
    expect(ran).toEqual(['']) // …but the effect was deferred, not run synchronously
    sched.flushSync()
    expect(ran).toEqual(['', 'abc'])
  })

  it('is a plain synchronous batch when no scheduler is injected (SSR/test-safe)', () => {
    const q = signal('')
    const ran: string[] = []
    effect(() => ran.push(q()))
    startTransition(() => q.set('x'))
    expect(ran).toEqual(['', 'x']) // ran synchronously — no scheduler to defer to
  })

  it('coalesces multiple transition writes into one deferred run', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const a = signal(0)
    const ran: number[] = []
    effect(() => ran.push(a()))
    startTransition(() => {
      a.set(1)
      a.set(2)
      a.set(3)
    })
    expect(ran).toEqual([0]) // deferred + batched
    sched.flushSync()
    expect(ran).toEqual([0, 3])
  })
})

describe('deferred', () => {
  afterEach(() => setReactiveScheduler(null))

  it('lags the source under a scheduler and converges after the drain', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    createRoot(() => {
      const src = signal(0)
      const view = deferred(() => src())
      expect(view()).toBe(0)
      src.set(1)
      expect(src()).toBe(1) // live value is current…
      expect(view()).toBe(0) // …deferred view still lags
      sched.flushSync()
      expect(view()).toBe(1) // converged
    })
  })

  it('mirrors the source synchronously when no scheduler is injected (no lag)', () => {
    createRoot(() => {
      const src = signal(0)
      const view = deferred(() => src())
      src.set(5)
      expect(view()).toBe(5) // synchronous fallback — SSR/test parity
    })
  })

  it('deferred() inside an effect does not subscribe the enclosing effect to source', () => {
    createRoot(() => {
      const src = signal(0)
      let outerRuns = 0
      effect(() => {
        outerRuns++
        deferred(() => src())
      })
      expect(outerRuns).toBe(1)
      src.set(1) // must NOT re-run the outer effect — the deferred seed is read untracked
      expect(outerRuns).toBe(1)
    })
  })
})
