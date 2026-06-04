import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { RouterError } from './errors'
import { parseQuery, safeValidateSearch, stringifyQuery, validateSearch } from './search'
import type { StandardSchemaV1 } from './standard-schema'

describe('parseQuery', () => {
  it('parses single keys to strings', () => {
    expect(parseQuery('?page=2&q=hi')).toEqual({ page: '2', q: 'hi' })
  })

  it('tolerates a missing leading question mark and empty input', () => {
    expect(parseQuery('page=2')).toEqual({ page: '2' })
    expect(parseQuery('')).toEqual({})
    expect(parseQuery('?')).toEqual({})
  })

  it('collapses repeated keys into an ordered array', () => {
    expect(parseQuery('?tag=a&tag=b&tag=c')).toEqual({ tag: ['a', 'b', 'c'] })
  })

  it('decodes percent-encoding and plus-as-space', () => {
    expect(parseQuery('?q=hello%20world')).toEqual({ q: 'hello world' })
    expect(parseQuery('?q=a+b')).toEqual({ q: 'a b' })
  })

  it('handles a key with no value', () => {
    expect(parseQuery('?flag')).toEqual({ flag: '' })
  })

  it('treats inherited Object.prototype keys as ordinary string params', () => {
    for (const key of ['constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
      const out = parseQuery(`?${key}=x`)
      expect(Array.isArray(out[key])).toBe(false) // not a leaked builtin wrapped in an array
      expect(out[key]).toBe('x')
    }
  })

  it('does not leak builtins or mutate the prototype via __proto__ keys', () => {
    const single = parseQuery('?__proto__=zzz')
    expect(Object.keys(single)).toContain('__proto__')
    expect(Object.getOwnPropertyDescriptor(single, '__proto__')?.value).toBe('zzz')

    const repeated = parseQuery('?__proto__=a&__proto__=b')
    expect(Array.isArray(Object.getPrototypeOf(repeated))).toBe(false) // prototype untouched
    expect(Object.getOwnPropertyDescriptor(repeated, '__proto__')?.value).toEqual(['a', 'b'])
  })
})

describe('stringifyQuery', () => {
  it('serializes scalars and skips null/undefined', () => {
    expect(stringifyQuery({ page: 2, q: 'hi', empty: null, gone: undefined })).toBe('page=2&q=hi')
  })

  it('emits one pair per array item and sorts keys', () => {
    expect(stringifyQuery({ tag: ['a', 'b'], page: 1 })).toBe('page=1&tag=a&tag=b')
  })

  it('round-trips with parseQuery', () => {
    expect(parseQuery(`?${stringifyQuery({ page: 2, tag: ['a', 'b'] })}`)).toEqual({
      page: '2',
      tag: ['a', 'b'],
    })
  })
})

// A hand-rolled, zero-dependency Standard Schema validator — proves the router
// needs no specific library, only the `~standard` contract.
const handRolled: StandardSchemaV1<unknown, { page: number }> = {
  '~standard': {
    version: 1,
    vendor: 'mindees-test',
    validate(value) {
      const page = Number((value as Record<string, unknown>)?.page)
      if (Number.isNaN(page)) {
        return { issues: [{ message: 'page must be a number', path: ['page'] }] }
      }
      return { value: { page } }
    },
  },
}

describe('validateSearch', () => {
  it('returns the typed value on success (hand-rolled schema)', () => {
    expect(validateSearch(handRolled, { page: '2' })).toEqual({ page: 2 })
  })

  it('throws RouterError(VALIDATE_SEARCH) with issues on failure', () => {
    try {
      validateSearch(handRolled, { page: 'nope' })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(RouterError)
      expect((e as RouterError).code).toBe('VALIDATE_SEARCH')
      expect((e as RouterError).issues?.[0]?.message).toBe('page must be a number')
    }
  })

  it('rejects async schemas with RouterError(ASYNC_SCHEMA)', () => {
    const asyncSchema: StandardSchemaV1<unknown, unknown> = {
      '~standard': {
        version: 1,
        vendor: 'async',
        validate: () => Promise.resolve({ value: {} }),
      },
    }
    try {
      validateSearch(asyncSchema, {})
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as RouterError).code).toBe('ASYNC_SCHEMA')
    }
  })
})

describe('safeValidateSearch', () => {
  it('returns ok:false with issues instead of throwing', () => {
    const result = safeValidateSearch(handRolled, { page: 'nope' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toHaveLength(1)
  })

  it('treats a legitimate undefined success value as ok (discriminates on issues)', () => {
    const undefinedSchema: StandardSchemaV1<unknown, undefined> = {
      '~standard': {
        version: 1,
        vendor: 'undef',
        validate: () => ({ value: undefined }),
      },
    }
    const result = safeValidateSearch(undefinedSchema, {})
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBeUndefined()
  })
})

// Validator-agnosticism: the SAME router API accepts real Zod and Valibot
// schemas directly, through the Standard Schema interface — no adapters.
describe('Standard Schema agnosticism', () => {
  it('accepts a Zod 4 schema directly', () => {
    const schema = z.object({ page: z.coerce.number(), q: z.string() })
    expect(validateSearch(schema, parseQuery('?page=2&q=hi'))).toEqual({ page: 2, q: 'hi' })
  })

  it('accepts a Valibot schema directly', () => {
    const schema = v.object({
      page: v.pipe(v.string(), v.transform(Number)),
      q: v.string(),
    })
    expect(validateSearch(schema, parseQuery('?page=2&q=hi'))).toEqual({ page: 2, q: 'hi' })
  })

  it('surfaces Zod validation failures as RouterError issues', () => {
    const schema = z.object({ page: z.coerce.number() })
    try {
      validateSearch(schema, { page: 'not-a-number' })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(RouterError)
      expect((e as RouterError).code).toBe('VALIDATE_SEARCH')
      expect((e as RouterError).issues?.length).toBeGreaterThan(0)
    }
  })
})
