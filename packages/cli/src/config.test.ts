import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'
import { createMemoryFileSystem } from './fs'

describe('loadConfig', () => {
  it('reads mindees.config.json', () => {
    const fs = createMemoryFileSystem({
      'mindees.config.json': '{"perf":false,"budget":{"maxElements":50},"appName":"X"}',
    })
    const c = loadConfig(fs, '.')
    expect(c.perf).toBe(false)
    expect(c.budget).toEqual({ maxElements: 50 })
    expect(c.appName).toBe('X')
  })

  it('returns {} when the config is absent', () => {
    expect(loadConfig(createMemoryFileSystem(), '.')).toEqual({})
  })

  it('returns {} on malformed JSON (never throws)', () => {
    const fs = createMemoryFileSystem({ 'mindees.config.json': '{ not json' })
    expect(loadConfig(fs, '.')).toEqual({})
  })
})
