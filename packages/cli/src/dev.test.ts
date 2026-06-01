import { describe, expect, it, vi } from 'vitest'
import { startDev, type Watcher } from './dev'
import { createMemoryFileSystem } from './fs'

/** A controllable fake watcher: tests fire `emit()` to simulate file changes. */
function fakeWatcher(): Watcher & { emit(path: string): void; listenerCount(): number } {
  const listeners = new Set<(p: string) => void>()
  return {
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit(path) {
      for (const l of listeners) l(path)
    },
    listenerCount: () => listeners.size,
  }
}

describe('startDev', () => {
  it('builds once immediately', () => {
    const fs = createMemoryFileSystem({
      'src/App.tsx':
        'import { createElement } from "@mindees/core"\nexport const App = () => <view/>',
    })
    const session = startDev(fs, fakeWatcher())
    expect(session.buildCount).toBe(1)
    expect(session.lastResult.ok).toBe(true)
    session.stop()
  })

  it('rebuilds on each watcher change', () => {
    const fs = createMemoryFileSystem({
      'src/App.tsx':
        'import { createElement } from "@mindees/core"\nexport const App = () => <view/>',
    })
    const watcher = fakeWatcher()
    const session = startDev(fs, watcher)
    expect(session.buildCount).toBe(1)
    watcher.emit('src/App.tsx')
    watcher.emit('src/App.tsx')
    expect(session.buildCount).toBe(3)
    session.stop()
  })

  it('calls onRebuild with the result and changed path', () => {
    const fs = createMemoryFileSystem({
      'src/App.tsx':
        'import { createElement } from "@mindees/core"\nexport const App = () => <view/>',
    })
    const watcher = fakeWatcher()
    const onRebuild = vi.fn()
    const session = startDev(fs, watcher, { onRebuild })
    expect(onRebuild).toHaveBeenCalledTimes(1)
    expect(onRebuild.mock.calls[0]?.[1]).toBeNull() // initial build: no changed path
    watcher.emit('src/App.tsx')
    expect(onRebuild).toHaveBeenCalledTimes(2)
    expect(onRebuild.mock.calls[1]?.[1]).toBe('src/App.tsx')
    session.stop()
  })

  it('stop() unsubscribes the watcher (no more rebuilds)', () => {
    const fs = createMemoryFileSystem({
      'src/App.tsx':
        'import { createElement } from "@mindees/core"\nexport const App = () => <view/>',
    })
    const watcher = fakeWatcher()
    const session = startDev(fs, watcher)
    expect(watcher.listenerCount()).toBe(1)
    session.stop()
    expect(watcher.listenerCount()).toBe(0)
    watcher.emit('src/App.tsx')
    expect(session.buildCount).toBe(1) // unchanged after stop
  })

  it('reflects new build results after edits', () => {
    const fs = createMemoryFileSystem({
      'src/App.tsx':
        'import { createElement } from "@mindees/core"\nexport const App = () => <view/>',
    })
    const watcher = fakeWatcher()
    const session = startDev(fs, watcher)
    expect(session.lastResult.ok).toBe(true)
    // Introduce a type error, then trigger a rebuild.
    fs.writeFile('src/App.tsx', 'export const n: number = "bad"')
    watcher.emit('src/App.tsx')
    expect(session.lastResult.ok).toBe(false)
    session.stop()
  })
})
