import { describe, expect, it, vi } from 'vitest'
import { createRoot, effect, onCleanup, signal } from './reactive'

describe('disposal: a throwing cleanup does not strand the others', () => {
  it('runs every cleanup even when one throws, then surfaces the error', () => {
    const a = vi.fn()
    const b = vi.fn()
    const dispose = createRoot((dispose) => {
      effect(() => {
        onCleanup(a)
        onCleanup(() => {
          throw new Error('boom')
        })
        onCleanup(b)
      })
      return dispose
    })

    expect(() => dispose()).toThrow('boom')
    // both well-behaved cleanups still ran, despite the thrower between them
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('aggregates multiple thrown cleanup errors', () => {
    const dispose = createRoot((dispose) => {
      effect(() => {
        onCleanup(() => {
          throw new Error('one')
        })
        onCleanup(() => {
          throw new Error('two')
        })
      })
      return dispose
    })

    let caught: unknown
    try {
      dispose()
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(AggregateError)
    expect((caught as AggregateError).errors).toHaveLength(2)
  })

  it('clears cleanups so a second dispose is a no-op', () => {
    const n = signal(0)
    const cleanup = vi.fn(() => {
      throw new Error('x')
    })
    const dispose = createRoot((dispose) => {
      effect(() => {
        n()
        onCleanup(cleanup)
      })
      return dispose
    })
    expect(() => dispose()).toThrow('x')
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(() => dispose()).not.toThrow() // cleanups already cleared
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})
