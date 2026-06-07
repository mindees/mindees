import { afterEach, describe, expect, it } from 'vitest'
import { createScheduler } from '../scheduler'
import { batch, computed, effect, setReactiveScheduler, signal, startTransition } from './index'
import { _deferredEffectCount } from './reactive'

// A scheduler whose normal lane never auto-drains (no-op microtask), so we control timing via flushSync().
const manualScheduler = () => createScheduler({ scheduleMicrotask: () => {} })

/**
 * Urgent-interrupts-transition: a transition defers an effect; a subsequent URGENT write (outside any
 * transition) must run that effect SYNCHRONOUSLY with the urgent value, cancelling the stale deferred
 * run — whether the effect reads the signal directly or through one/many computeds. (The prior partial
 * fix only handled the direct edge; the mark died at an already-colored computed.)
 */
describe('urgent write preempts a transition-deferred effect', () => {
  afterEach(() => setReactiveScheduler(null))

  it('Scenario A — direct signal → effect', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const q = signal('')
    const ran: string[] = []
    effect(() => ran.push(q()))
    expect(ran).toEqual([''])

    startTransition(() => q.set('a'))
    expect(ran).toEqual(['']) // deferred by the transition
    q.set('b') // URGENT
    expect(ran).toEqual(['', 'b']) // ran synchronously with the urgent value
    sched.flushSync()
    expect(ran).toEqual(['', 'b']) // the stale deferred 'a' run was cancelled (no duplicate)
  })

  it('Scenario B — signal → computed → effect (the headline gap)', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const q = signal('')
    const m = computed(() => q())
    const ran: string[] = []
    effect(() => ran.push(m()))
    expect(ran).toEqual([''])

    startTransition(() => q.set('a'))
    expect(ran).toEqual([''])
    q.set('b') // URGENT — mark travels q → (DIRTY) m → effect
    expect(ran).toEqual(['', 'b']) // delivered synchronously through the computed
    sched.flushSync()
    expect(ran).toEqual(['', 'b'])
  })

  it('deep chain — signal → m1 → m2 → effect (crosses multiple already-colored computeds)', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const q = signal(0)
    const m1 = computed(() => q() + 1)
    const m2 = computed(() => m1() * 10)
    const ran: number[] = []
    effect(() => ran.push(m2()))
    expect(ran).toEqual([10]) // (0+1)*10

    startTransition(() => q.set(1))
    expect(ran).toEqual([10])
    q.set(2) // URGENT → expect (2+1)*10 = 30
    expect(ran).toEqual([10, 30])
    sched.flushSync()
    expect(ran).toEqual([10, 30]) // exactly once, latest value
  })

  it('diamond stays glitch-free under preemption (no intermediate value)', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const a = signal(1)
    const m = computed(() => a() + a())
    const ran: number[] = []
    effect(() => ran.push(m()))
    expect(ran).toEqual([2])

    startTransition(() => a.set(5))
    a.set(9) // URGENT → must be a single consistent 18, never 10 (5+5) or any intermediate
    expect(ran).toEqual([2, 18])
    sched.flushSync()
    expect(ran).toEqual([2, 18])
  })

  it('pure transitions still coalesce — preemption must NOT fire without an urgent write', () => {
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
    expect(ran).toEqual([0]) // deferred + coalesced
    sched.flushSync()
    expect(ran).toEqual([0, 3]) // one run, final value
  })

  it('disposing a deferred effect: a later urgent write runs nothing', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const q = signal('')
    const ran: string[] = []
    const stop = effect(() => ran.push(q()))
    startTransition(() => q.set('a'))
    expect(ran).toEqual([''])
    stop() // dispose while deferred
    q.set('b') // URGENT — nothing to run
    expect(ran).toEqual([''])
    sched.flushSync()
    expect(ran).toEqual([''])
  })

  it('two independent deferred effects, urgent to the shared signal preempts both reachable', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const s = signal(0)
    const a: number[] = []
    const b: number[] = []
    effect(() => a.push(s()))
    effect(() => b.push(s()))
    startTransition(() => s.set(1))
    expect(a).toEqual([0])
    expect(b).toEqual([0])
    s.set(2) // URGENT
    expect(a).toEqual([0, 2])
    expect(b).toEqual([0, 2])
    sched.flushSync()
    expect(a).toEqual([0, 2])
    expect(b).toEqual([0, 2])
  })
})

// The deferredEffectCount must always return to 0 when idle — a leak would permanently arm the
// preemption path (a latent perf cliff). These guard every increment/decrement transition.
describe('deferredEffectCount stays balanced (returns to 0)', () => {
  afterEach(() => setReactiveScheduler(null))

  it('after a preemption (Scenario B)', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const q = signal('')
    const m = computed(() => q())
    effect(() => void m())
    startTransition(() => q.set('a'))
    expect(_deferredEffectCount()).toBe(1) // one effect deferred
    q.set('b') // urgent → preempt → cancel the task
    expect(_deferredEffectCount()).toBe(0)
    sched.flushSync()
    expect(_deferredEffectCount()).toBe(0)
  })

  it('after a normal deferred run drains', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const s = signal(0)
    effect(() => void s(), { priority: 'normal' })
    s.set(1)
    expect(_deferredEffectCount()).toBe(1)
    sched.flushSync()
    expect(_deferredEffectCount()).toBe(0) // task ran → decremented
  })

  it('after disposing a deferred effect', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const q = signal('')
    const stop = effect(() => void q())
    startTransition(() => q.set('a'))
    expect(_deferredEffectCount()).toBe(1)
    stop() // cancels the pending task
    expect(_deferredEffectCount()).toBe(0)
  })

  it('after coalesced rapid re-stales (no double-count)', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const s = signal(0)
    effect(() => void s(), { priority: 'normal' })
    s.set(1)
    s.set(2)
    s.set(3) // three re-stales, same key → ONE deferred slot
    expect(_deferredEffectCount()).toBe(1)
    sched.flushSync()
    expect(_deferredEffectCount()).toBe(0)
  })

  it('detaching the scheduler flushes a deferred normal-lane effect (no leak, no orphan)', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const q = signal('')
    const ran: string[] = []
    effect(() => ran.push(q()), { priority: 'normal' })
    expect(ran).toEqual([''])
    q.set('a') // defers
    expect(_deferredEffectCount()).toBe(1)
    setReactiveScheduler(null) // detach mid-defer → flush synchronously (no scheduler to defer to)
    expect(_deferredEffectCount()).toBe(0)
    expect(ran).toEqual(['', 'a']) // ran on detach — NOT orphaned dead
    q.set('b') // and still live afterward (no scheduler → synchronous)
    expect(ran).toEqual(['', 'a', 'b'])
  })

  it('detaching mid-transition-defer does not orphan a sync effect', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const q = signal('')
    const ran: string[] = []
    effect(() => ran.push(q())) // sync effect, transition-deferred below
    expect(ran).toEqual([''])
    startTransition(() => q.set('a')) // deferred
    setReactiveScheduler(null) // detach → flush the parked effect
    expect(ran).toEqual(['', 'a']) // ran, not dead
    q.set('b') // still live
    expect(ran).toEqual(['', 'a', 'b'])
    expect(_deferredEffectCount()).toBe(0)
  })

  it('detaching INSIDE a batch preserves atomicity (no mid-batch flush, one final run)', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const x = signal(0)
    const ran: number[] = []
    effect(() => ran.push(x()), { priority: 'normal' })
    x.set(1) // deferred under sched
    ran.length = 0
    batch(() => {
      x.set(2)
      setReactiveScheduler(null) // detach mid-batch — must NOT force a flush (would expose intermediate)
      expect(ran).toEqual([]) // no torn mid-batch run
      x.set(3)
    })
    expect(ran).toEqual([3]) // drains at batch end, once, with the FINAL value
    expect(_deferredEffectCount()).toBe(0)
  })

  it('replacing the scheduler re-defers a normal-lane effect under the new one (no orphan)', () => {
    const a = manualScheduler()
    const b = manualScheduler()
    setReactiveScheduler(a)
    const q = signal('')
    const ran: string[] = []
    effect(() => ran.push(q()), { priority: 'normal' })
    q.set('x') // deferred under A
    expect(_deferredEffectCount()).toBe(1)
    setReactiveScheduler(b) // replace A→B: re-defers under B (still a normal-lane effect)
    expect(_deferredEffectCount()).toBe(1) // re-armed under B, not lost
    b.flushSync()
    expect(ran).toEqual(['', 'x']) // drains under B
    expect(_deferredEffectCount()).toBe(0)
  })
})

// Regressions for the three defects the adversarial verification found in the first implementation.
describe('preemption — adversarial regressions', () => {
  afterEach(() => setReactiveScheduler(null))

  it('does NOT re-run an effect whose observed memo is unchanged across an urgent preempt', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const q = signal(0)
    const even = computed(() => q() % 2 === 0)
    const runs: boolean[] = []
    effect(() => runs.push(even()))
    expect(runs).toEqual([true])
    startTransition(() => q.set(2)) // even stays true (unchanged)
    q.set(4) // URGENT — even STILL true → must NOT re-run (no redundant recompute)
    expect(runs).toEqual([true])
    sched.flushSync()
    expect(runs).toEqual([true])
  })

  it('a normal-lane effect urgent-written mid-drain stays deferred but is NOT dropped (was left dead)', () => {
    const sched = manualScheduler()
    setReactiveScheduler(sched)
    const s = signal(0)
    const q = signal(0)
    const seen: number[] = []
    effect(
      () => {
        s()
        seen.push(q())
      },
      { priority: 'normal' },
    ) // E: normal-lane (always deferred), reads s + q — enqueued FIRST
    let primed = false
    effect(() => {
      s()
      if (primed) q.set(99) // F: sync — urgent-writes q while E sits deferred earlier in the drain
      primed = true
    })
    seen.length = 0 // ignore initial runs
    s.set(1) // one drain: E defers (queued first), then F runs and urgent-writes q (E reads q)
    expect(seen).toEqual([]) // E is normal-lane → stays deferred (not forced synchronous)
    sched.flushSync()
    expect(seen).toEqual([99]) // runs ONCE with the latest q — not silently dropped (the bug left it dead)
    expect(_deferredEffectCount()).toBe(0)
  })
})
