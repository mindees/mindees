import { describe, expect, it, vi } from 'vitest'
import { _observerCount, createRoot, effect, onCleanup, signal } from './reactive'

// Regression: an effect that disposes itself mid-run (a legitimate "run, then
// stop" pattern) must not leave the now-DISPOSED node subscribed to signals it
// reads afterwards, nor register cleanups on the dead scope — nothing tears a
// disposed node down again, so either would leak forever.
describe('self-disposing effect (dispose called inside its own body)', () => {
  it('does not leak a subscription on signals read after self-dispose', () => {
    const s = signal(0)
    const t = signal(0)
    let stop!: () => void
    createRoot(() => {
      stop = effect(() => {
        if (s() > 0) {
          stop() // dispose self mid-run...
          t() // ...then a tracked read that must NOT re-subscribe the dead node
        }
      })
    })
    expect(_observerCount(s)).toBe(1) // first run only read s
    expect(_observerCount(t)).toBe(0)

    s.set(1) // re-run: self-disposes, then reads t
    expect(_observerCount(s)).toBe(0) // unlinked by disposal
    expect(_observerCount(t)).toBe(0) // never subscribed (observer was disposed)
  })

  it('ignores cleanups registered after self-dispose', () => {
    const s = signal(0)
    const after = vi.fn()
    let stop!: () => void
    createRoot(() => {
      stop = effect(() => {
        if (s() > 0) {
          stop()
          onCleanup(after) // registered on a dead scope — must be ignored
        }
      })
    })
    s.set(1)
    expect(after).not.toHaveBeenCalled()
  })
})
