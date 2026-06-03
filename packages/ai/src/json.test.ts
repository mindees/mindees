import { describe, expect, it } from 'vitest'
import { AiError } from './errors'
import {
  containsForbiddenKey,
  extractJson,
  formatIssues,
  lenientParseJson,
  sanitizeJson,
  validateStandard,
} from './json'
import type { StandardSchemaV1 } from './standard-schema'

describe('extractJson', () => {
  it('parses raw JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
    expect(extractJson('  [1,2,3]  ')).toEqual({ ok: true, value: [1, 2, 3] })
  })

  it('parses a fenced ```json block', () => {
    const text = 'Here you go:\n```json\n{"a":1}\n```\nThanks!'
    expect(extractJson(text)).toEqual({ ok: true, value: { a: 1 } })
  })

  it('parses a bare ``` fence', () => {
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } })
  })

  it('extracts a balanced span past leading prose', () => {
    expect(extractJson('The answer is {"a":1} ok')).toEqual({ ok: true, value: { a: 1 } })
  })

  it('handles prose that itself contains braces', () => {
    // The first balanced span starting at the first { is the real object.
    expect(extractJson('note {x} then {"a":1}')).toEqual({ ok: false, reason: expect.any(String) })
    // ...but a clean object after prose with no stray braces is found.
    expect(extractJson('result: {"a":1}')).toEqual({ ok: true, value: { a: 1 } })
  })

  it('takes the FIRST of two objects', () => {
    expect(extractJson('{"a":1} {"b":2}')).toEqual({ ok: true, value: { a: 1 } })
  })

  it('does not miscount braces inside strings', () => {
    expect(extractJson('x {"a":"}{"} y')).toEqual({ ok: true, value: { a: '}{' } })
  })

  it('fails on unterminated JSON', () => {
    expect(extractJson('{"a":').ok).toBe(false)
    expect(extractJson('no json here').ok).toBe(false)
  })

  it('rejects oversized input before parsing', () => {
    const big = `{"a":"${'x'.repeat(50)}"}`
    expect(extractJson(big, 10)).toEqual({ ok: false, reason: expect.stringContaining('exceeds') })
  })
})

describe('lenientParseJson', () => {
  it('parses a complete object/array', () => {
    expect(lenientParseJson('{"a":1}')).toEqual({ a: 1 })
    expect(lenientParseJson('[1,2]')).toEqual([1, 2])
  })

  it('closes open structures and dangling separators', () => {
    expect(lenientParseJson('{"a":1')).toEqual({ a: 1 })
    expect(lenientParseJson('{"a":1,')).toEqual({ a: 1 })
    expect(lenientParseJson('{"a":"hi')).toEqual({ a: 'hi' })
    expect(lenientParseJson('[1,2,')).toEqual([1, 2])
    expect(lenientParseJson('{"a":[1,{"b":2')).toEqual({ a: [1, { b: 2 }] })
  })

  it('returns undefined when it cannot safely parse', () => {
    expect(lenientParseJson('{"a":')).toBeUndefined() // dangling key, no value
    expect(lenientParseJson('{"a":tr')).toBeUndefined() // partial literal
    expect(lenientParseJson('no structure')).toBeUndefined()
  })

  it('returns undefined for oversized input', () => {
    expect(lenientParseJson('{"a":1}', 3)).toBeUndefined()
  })
})

describe('containsForbiddenKey', () => {
  it('detects a poison key at any depth (without cloning)', () => {
    expect(containsForbiddenKey(JSON.parse('{"a":1}'))).toBe(false)
    expect(containsForbiddenKey(JSON.parse('{"__proto__":{"x":1}}'))).toBe(true)
    expect(containsForbiddenKey(JSON.parse('{"a":{"b":{"constructor":1}}}'))).toBe(true)
    expect(containsForbiddenKey(JSON.parse('[{"ok":1},{"prototype":2}]'))).toBe(true)
    expect(containsForbiddenKey([1, 2, { ok: true }])).toBe(false)
  })

  it('is depth-capped and fail-closed on very deep input', () => {
    let deep: unknown = 1
    for (let i = 0; i < 100; i++) deep = { nested: deep }
    expect(containsForbiddenKey(deep, 16)).toBe(true) // too deep to vet → treated as forbidden
  })
})

describe('sanitizeJson', () => {
  it('deep-clones plain JSON', () => {
    const input = { a: 1, b: [{ c: 'x' }], d: true, e: null }
    const out = sanitizeJson(input)
    expect(out).toEqual(input)
    expect(out).not.toBe(input)
  })

  it('rejects a nested __proto__ key and does not pollute the prototype', () => {
    const payload = JSON.parse('{"a":{"__proto__":{"polluted":1}}}')
    expect(() => sanitizeJson(payload)).toThrow(AiError)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('rejects constructor / prototype keys at any depth', () => {
    expect(() => sanitizeJson(JSON.parse('{"constructor":1}'))).toThrow(AiError)
    expect(() => sanitizeJson(JSON.parse('{"x":{"prototype":1}}'))).toThrow(AiError)
  })

  it('enforces depth, node, string, and prop limits', () => {
    const limits = { maxDepth: 2, maxNodes: 1000, maxStringLength: 5, maxProps: 2 }
    expect(() => sanitizeJson({ a: { b: { c: 1 } } }, limits)).toThrow(/max depth/)
    expect(() => sanitizeJson({ a: 'toolong!' }, limits)).toThrow(/max length/)
    expect(() => sanitizeJson({ a: 1, b: 2, c: 3 }, limits)).toThrow(/max keys/)
    expect(() =>
      sanitizeJson(
        Array.from({ length: 10 }, (_, i) => i),
        { ...limits, maxNodes: 3 },
      ),
    ).toThrow(/max nodes/)
  })

  it('rejects non-finite numbers', () => {
    expect(() => sanitizeJson({ a: Number.POSITIVE_INFINITY })).toThrow(/finite/)
  })
})

describe('formatIssues', () => {
  it('renders path: message; …', () => {
    const issues: StandardSchemaV1.Issue[] = [
      { message: 'required', path: ['title'] },
      { message: 'too small', path: [{ key: 'count' }] },
      { message: 'bad root' },
    ]
    expect(formatIssues(issues)).toBe('title: required; count: too small; bad root')
  })

  it('tolerates a non-array issues value', () => {
    expect(formatIssues('oops' as unknown as StandardSchemaV1.Issue[])).toBe('')
  })

  it('does not throw on a symbol path segment (PropertyKey is string | number | symbol)', () => {
    const sym = Symbol('field')
    expect(formatIssues([{ message: 'bad', path: [sym] }])).toContain('bad')
    expect(formatIssues([{ message: 'bad', path: [{ key: sym }] }])).toContain('bad')
  })

  it('tolerates a malformed (non-array) issue path', () => {
    const issue = { message: 'bad', path: 'oops' } as unknown as StandardSchemaV1.Issue
    expect(formatIssues([issue])).toBe('bad')
  })
})

// A tiny inline Standard Schema validator (real validators — Zod/Valibot/ArkType — work
// through the identical `~standard` interface; agnosticism is already proven in the router).
function numberSchema(): StandardSchemaV1<unknown, number> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (v) =>
        typeof v === 'number' ? { value: v } : { issues: [{ message: 'expected number' }] },
    },
  }
}

describe('validateStandard', () => {
  it('returns the value on success (sync)', async () => {
    expect(await validateStandard(numberSchema(), 42)).toEqual({ ok: true, value: 42 })
  })

  it('returns issues on failure', async () => {
    const r = await validateStandard(numberSchema(), 'x')
    expect(r.ok).toBe(false)
  })

  it('awaits an async validator', async () => {
    const asyncSchema: StandardSchemaV1<unknown, number> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (v) =>
          Promise.resolve(typeof v === 'number' ? { value: v } : { issues: [{ message: 'no' }] }),
      },
    }
    expect(await validateStandard(asyncSchema, 7)).toEqual({ ok: true, value: 7 })
  })

  it('treats a malformed validator result as a failure', async () => {
    const bad: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => ({ issues: 'oops' }) as unknown as StandardSchemaV1.Result<unknown>,
      },
    }
    const r = await validateStandard(bad, 1)
    expect(r).toEqual({ ok: false, issues: [] })
  })

  it('treats a non-object validator result as a failure (no crash)', async () => {
    const bogus: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => null as unknown as StandardSchemaV1.Result<unknown>,
      },
    }
    expect(await validateStandard(bogus, 1)).toEqual({ ok: false, issues: [] })
  })

  it('discriminates on issues, not value (undefined is a valid success)', async () => {
    const undefSchema: StandardSchemaV1<unknown, undefined> = {
      '~standard': { version: 1, vendor: 'test', validate: () => ({ value: undefined }) },
    }
    expect(await validateStandard(undefSchema, 'anything')).toEqual({ ok: true, value: undefined })
  })
})
