import { describe, expect, it } from 'vitest'
import { RouterError } from './errors'
import { buildPath, compareSpecificity, matchPattern, parsePattern } from './pattern'

describe('parsePattern', () => {
  it('classifies static, dynamic, and catch-all segments', () => {
    expect(parsePattern('/posts/:id/comments/:rest*')).toEqual([
      { kind: 'static', value: 'posts' },
      { kind: 'param', value: 'id' },
      { kind: 'static', value: 'comments' },
      { kind: 'catchAll', value: 'rest' },
    ])
  })

  it('treats root and empty as zero segments', () => {
    expect(parsePattern('/')).toEqual([])
    expect(parsePattern('')).toEqual([])
  })

  it('rejects a catch-all that is not last', () => {
    expect(() => parsePattern('/files/:rest*/edit')).toThrow(RouterError)
    try {
      parsePattern('/files/:rest*/edit')
    } catch (e) {
      expect((e as RouterError).code).toBe('INVALID_PATTERN')
    }
  })
})

describe('matchPattern', () => {
  it('matches static paths exactly', () => {
    expect(matchPattern('/about', '/about')).toEqual({})
    expect(matchPattern('/about', '/contact')).toBeNull()
  })

  it('matches the root', () => {
    expect(matchPattern('/', '/')).toEqual({})
    expect(matchPattern('/', '/x')).toBeNull()
  })

  it('extracts dynamic params (URI-decoded)', () => {
    expect(matchPattern('/posts/:id', '/posts/42')).toEqual({ id: '42' })
    expect(matchPattern('/u/:name', '/u/ada%20lovelace')).toEqual({ name: 'ada lovelace' })
  })

  it('requires dynamic segments to be non-empty and present', () => {
    expect(matchPattern('/posts/:id', '/posts')).toBeNull()
    expect(matchPattern('/posts/:id', '/posts/1/extra')).toBeNull()
  })

  it('captures the remainder with a catch-all (including empty)', () => {
    expect(matchPattern('/files/:rest*', '/files/a/b/c')).toEqual({ rest: 'a/b/c' })
    expect(matchPattern('/files/:rest*', '/files')).toEqual({ rest: '' })
    expect(matchPattern('/files/:rest*', '/files/a%2Fb')).toEqual({ rest: 'a/b' })
  })

  it('tolerates trailing slashes', () => {
    expect(matchPattern('/posts/:id', '/posts/42/')).toEqual({ id: '42' })
  })

  it('matches multiple params', () => {
    expect(matchPattern('/u/:userId/p/:postId', '/u/7/p/9')).toEqual({ userId: '7', postId: '9' })
  })
})

describe('buildPath', () => {
  it('fills static and dynamic segments (URI-encoded)', () => {
    expect(buildPath('/posts/:id', { id: '42' })).toBe('/posts/42')
    expect(buildPath('/u/:name', { name: 'ada lovelace' })).toBe('/u/ada%20lovelace')
    expect(buildPath('/about', {})).toBe('/about')
    expect(buildPath('/')).toBe('/')
  })

  it('accepts numeric param values', () => {
    expect(buildPath('/posts/:id', { id: 42 })).toBe('/posts/42')
  })

  it('throws on a missing required param', () => {
    expect(() => buildPath('/posts/:id', {})).toThrow(RouterError)
    try {
      buildPath('/posts/:id', {})
    } catch (e) {
      expect((e as RouterError).code).toBe('MISSING_PARAM')
    }
  })

  it('treats catch-all as optional and encodes each sub-segment', () => {
    expect(buildPath('/files/:rest*', { rest: 'a/b' })).toBe('/files/a/b')
    expect(buildPath('/files/:rest*', {})).toBe('/files')
  })

  it('round-trips with matchPattern', () => {
    const path = buildPath('/u/:userId/p/:postId', { userId: '7', postId: '9' })
    expect(matchPattern('/u/:userId/p/:postId', path)).toEqual({ userId: '7', postId: '9' })
  })
})

describe('compareSpecificity', () => {
  it('orders static over dynamic over catch-all', () => {
    const routes = ['/posts/:rest*', '/posts/:id', '/posts/new']
    expect([...routes].sort(compareSpecificity)).toEqual([
      '/posts/new',
      '/posts/:id',
      '/posts/:rest*',
    ])
  })

  it('prefers longer (more specific) patterns', () => {
    expect(compareSpecificity('/a/b', '/a')).toBeLessThan(0)
  })

  it('ranks the explicit root above a bare catch-all', () => {
    expect(['/:rest*', '/'].sort(compareSpecificity)).toEqual(['/', '/:rest*'])
    expect(compareSpecificity('/', '/:rest*')).toBeLessThan(0)
  })

  it('still ranks a static segment above a catch-all at the same depth', () => {
    expect(compareSpecificity('/posts/new', '/posts/:rest*')).toBeLessThan(0)
  })
})
