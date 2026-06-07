import { createRoot, signal } from '@mindees/core'
import { describe, expect, it } from 'vitest'
import {
  type AsyncState,
  useAsync,
  useCounter,
  usePersistentSignal,
  usePrevious,
  useReducer,
  useToggle,
} from './hooks'

describe('useToggle', () => {
  it('toggles, sets, and reads reactively', () => {
    const t = useToggle()
    expect(t.value()).toBe(false)
    t.toggle()
    expect(t.value()).toBe(true)
    t.off()
    expect(t.value()).toBe(false)
    t.on()
    expect(t.value()).toBe(true)
    t.set(false)
    expect(t.value()).toBe(false)
  })
})

describe('useCounter', () => {
  it('increments, decrements, and clamps to [min, max]', () => {
    const c = useCounter(5, { min: 0, max: 10, step: 2 })
    expect(c.count()).toBe(5)
    c.inc()
    expect(c.count()).toBe(7)
    c.inc(10) // clamped to max
    expect(c.count()).toBe(10)
    c.dec(100) // clamped to min
    expect(c.count()).toBe(0)
    c.set(3)
    expect(c.count()).toBe(3)
    c.reset()
    expect(c.count()).toBe(5)
  })
})

describe('usePrevious', () => {
  it('reports the value before the latest change', () => {
    const src = signal(1)
    let prev!: () => number | undefined
    createRoot(() => {
      prev = usePrevious(() => src())
    })
    expect(prev()).toBeUndefined() // nothing before the first value
    src.set(2)
    expect(prev()).toBe(1)
    src.set(3)
    expect(prev()).toBe(2)
  })
})

describe('useReducer', () => {
  it('applies actions to reactive state', () => {
    const [state, dispatch] = useReducer(
      (n: number, a: 'inc' | 'dec') => (a === 'inc' ? n + 1 : n - 1),
      0,
    )
    expect(state()).toBe(0)
    dispatch('inc')
    dispatch('inc')
    expect(state()).toBe(2)
    dispatch('dec')
    expect(state()).toBe(1)
  })
})

describe('useAsync', () => {
  it('runs immediately: loading → data', async () => {
    let st!: AsyncState<number>
    createRoot(() => {
      st = useAsync(() => Promise.resolve(42))
    })
    expect(st.loading()).toBe(true)
    for (let i = 0; i < 4; i++) await Promise.resolve()
    expect(st.data()).toBe(42)
    expect(st.loading()).toBe(false)
    expect(st.error()).toBeUndefined()
  })

  it('captures rejection in error', async () => {
    let st!: AsyncState<number>
    createRoot(() => {
      st = useAsync(() => Promise.reject(new Error('boom')))
    })
    for (let i = 0; i < 4; i++) await Promise.resolve()
    expect((st.error() as Error).message).toBe('boom')
    expect(st.loading()).toBe(false)
  })

  it('the newest run wins (a stale in-flight result is ignored)', async () => {
    let resolveStale!: (v: number) => void
    const fetchers = [
      () =>
        new Promise<number>((r) => {
          resolveStale = r
        }),
      () => Promise.resolve(2),
    ]
    let i = 0
    const nextFetcher = (): Promise<number> => {
      const fn = fetchers[i++]
      if (!fn) throw new Error('no more fetchers')
      return fn()
    }
    let st!: AsyncState<number>
    createRoot(() => {
      st = useAsync(nextFetcher, { immediate: false })
    })
    st.run() // run #0: pending
    st.run() // run #1: resolves 2 (supersedes #0)
    for (let k = 0; k < 4; k++) await Promise.resolve()
    resolveStale(1) // #0 resolves late — must be ignored
    for (let k = 0; k < 4; k++) await Promise.resolve()
    expect(st.data()).toBe(2)
  })
})

describe('usePersistentSignal', () => {
  const mockStorage = (init: Record<string, string> = {}) => {
    const m = new Map<string, string>(Object.entries(init))
    return {
      getItem: (k: string): string | null => m.get(k) ?? null,
      setItem: (k: string, v: string): void => {
        m.set(k, v)
      },
    }
  }

  it('restores from storage on init, then auto-saves on change', () => {
    createRoot(() => {
      const storage = mockStorage({ theme: '"dark"' })
      const s = usePersistentSignal('theme', 'light', { storage })
      expect(s()).toBe('dark')
      s.set('solarized')
      expect(storage.getItem('theme')).toBe('"solarized"')
    })
  })

  it('uses the initial value when nothing is stored, and persists it', () => {
    createRoot(() => {
      const storage = mockStorage()
      const s = usePersistentSignal('count', 7, { storage })
      expect(s()).toBe(7)
      expect(storage.getItem('count')).toBe('7')
      s.set(8)
      expect(storage.getItem('count')).toBe('8')
    })
  })

  it('falls back to the initial value on a corrupt stored payload', () => {
    createRoot(() => {
      const storage = mockStorage({ n: 'not-json{' })
      const s = usePersistentSignal('n', 42, { storage })
      expect(s()).toBe(42)
    })
  })

  it('round-trips complex JSON values', () => {
    createRoot(() => {
      const storage = mockStorage()
      const s = usePersistentSignal('prefs', { a: 1, b: ['x'] }, { storage })
      s.set({ a: 2, b: ['x', 'y'] })
      expect(JSON.parse(storage.getItem('prefs') ?? 'null')).toEqual({ a: 2, b: ['x', 'y'] })
    })
  })
})
