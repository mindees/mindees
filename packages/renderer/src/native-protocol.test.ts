import { describe, expect, it } from 'vitest'
import {
  createNativeNodeIdFactory,
  isNativeCommand,
  isNativePropValue,
  type NativeCommand,
  normalizeNativeProp,
} from './native-protocol'

describe('isNativePropValue', () => {
  it('accepts serializable primitives, null, arrays, and plain objects', () => {
    expect(isNativePropValue('hi')).toBe(true)
    expect(isNativePropValue(42)).toBe(true)
    expect(isNativePropValue(true)).toBe(true)
    expect(isNativePropValue(null)).toBe(true)
    expect(isNativePropValue([1, 'two', false, null])).toBe(true)
    expect(isNativePropValue({ color: 'red', size: 12, nested: { a: [1, 2] } })).toBe(true)
  })

  it('rejects functions, undefined, symbols, bigints, and non-finite numbers', () => {
    expect(isNativePropValue(() => {})).toBe(false)
    expect(isNativePropValue(undefined)).toBe(false)
    expect(isNativePropValue(Symbol('x'))).toBe(false)
    expect(isNativePropValue(10n)).toBe(false)
    expect(isNativePropValue(Number.NaN)).toBe(false)
    expect(isNativePropValue(Number.POSITIVE_INFINITY)).toBe(false)
  })

  it('rejects non-plain objects and containers holding unrepresentable values', () => {
    expect(isNativePropValue(new Date())).toBe(false)
    expect(isNativePropValue(new Map())).toBe(false)
    expect(isNativePropValue([1, () => {}])).toBe(false)
    expect(isNativePropValue({ ok: 1, bad: () => {} })).toBe(false)
  })
})

describe('normalizeNativeProp', () => {
  it('passes representable values through', () => {
    expect(normalizeNativeProp('hi')).toBe('hi')
    expect(normalizeNativeProp(0)).toBe(0)
    expect(normalizeNativeProp(false)).toBe(false)
    expect(normalizeNativeProp(null)).toBe(null)
    expect(normalizeNativeProp([1, 2])).toEqual([1, 2])
  })

  it('returns undefined for unrepresentable scalars', () => {
    expect(normalizeNativeProp(undefined)).toBeUndefined()
    expect(normalizeNativeProp(() => {})).toBeUndefined()
    expect(normalizeNativeProp(Number.NaN)).toBeUndefined()
    expect(normalizeNativeProp(10n)).toBeUndefined()
  })

  it('rejects an array wholesale if any element is unrepresentable (no index shifting)', () => {
    expect(normalizeNativeProp([1, () => {}, 3])).toBeUndefined()
  })

  it('drops unrepresentable keys from a plain object', () => {
    expect(normalizeNativeProp({ color: 'red', onTap: () => {}, size: 12 })).toEqual({
      color: 'red',
      size: 12,
    })
  })

  it('rejects non-plain objects (Date/Map/class instances)', () => {
    expect(normalizeNativeProp(new Date())).toBeUndefined()
    expect(normalizeNativeProp(new Map())).toBeUndefined()
  })
})

describe('isNativeCommand', () => {
  it('accepts well-formed commands of every kind', () => {
    const commands: NativeCommand[] = [
      { type: 'createNode', id: 'a', tag: 'view' },
      { type: 'createText', id: 'b', text: 'hi' },
      { type: 'setProp', id: 'a', name: 'class', value: 'x' },
      { type: 'removeProp', id: 'a', name: 'class' },
      { type: 'insertChild', parentId: 'a', childId: 'b', index: 0 },
      { type: 'removeChild', parentId: 'a', childId: 'b' },
      { type: 'updateText', id: 'b', text: 'bye' },
      { type: 'disposeNode', id: 'b' },
      { type: 'registerEvent', id: 'a', eventName: 'press', handlerId: 'h1' },
      { type: 'unregisterEvent', id: 'a', eventName: 'press', handlerId: 'h1' },
    ]
    for (const command of commands) expect(isNativeCommand(command)).toBe(true)
  })

  it('rejects unknown types, missing fields, and bad payloads', () => {
    expect(isNativeCommand(null)).toBe(false)
    expect(isNativeCommand({ type: 'nope' })).toBe(false)
    expect(isNativeCommand({ type: 'createNode', id: 'a' })).toBe(false) // missing tag
    expect(isNativeCommand({ type: 'setProp', id: 'a', name: 'c', value: () => {} })).toBe(false)
    expect(isNativeCommand({ type: 'insertChild', parentId: 'a', childId: 'b', index: -1 })).toBe(
      false,
    )
    expect(isNativeCommand({ type: 'insertChild', parentId: 'a', childId: 'b', index: 1.5 })).toBe(
      false,
    )
  })
})

describe('createNativeNodeIdFactory', () => {
  it('produces unique, monotonically-suffixed ids', () => {
    const next = createNativeNodeIdFactory('x')
    expect([next(), next(), next()]).toEqual(['x1', 'x2', 'x3'])
  })

  it('does not collide across factories with distinct prefixes', () => {
    const a = createNativeNodeIdFactory('a')
    const b = createNativeNodeIdFactory('b')
    const ids = new Set([a(), a(), b(), b()])
    expect(ids.size).toBe(4)
  })
})

describe('protocol robustness (adversarial inputs)', () => {
  it('handles cyclic objects/arrays without throwing', () => {
    const obj: Record<string, unknown> = {}
    obj.self = obj
    expect(isNativePropValue(obj)).toBe(false)
    // object policy: the unrepresentable (cyclic) key is dropped — never throws
    expect(normalizeNativeProp(obj)).toEqual({})

    const arr: unknown[] = []
    arr.push(arr)
    expect(isNativePropValue(arr)).toBe(false)
    // array policy: rejected wholesale if any element is unrepresentable
    expect(normalizeNativeProp(arr)).toBeUndefined()
  })

  it('allows shared (non-cyclic / diamond) references', () => {
    const shared = { a: 1 }
    expect(isNativePropValue({ x: shared, y: shared })).toBe(true)
    expect(normalizeNativeProp([shared, shared])).toEqual([{ a: 1 }, { a: 1 }])
  })

  it('treats sparse arrays consistently — both guard and normalizer reject', () => {
    const holey = new Array(3)
    holey[0] = 1
    holey[2] = 3 // index 1 is a hole
    expect(isNativePropValue(holey)).toBe(false)
    expect(normalizeNativeProp(holey)).toBeUndefined()
  })

  it('keeps an own __proto__ key as data, not a prototype mutation', () => {
    const src = JSON.parse('{"__proto__":{"a":1},"b":2}')
    const out = normalizeNativeProp(src)
    expect(out).toBeTruthy()
    expect(isNativePropValue(out)).toBe(true) // normalize → validate round-trips
    expect((out as Record<string, unknown>).b).toBe(2)
    expect(Object.getPrototypeOf(out as object)).toBe(null) // prototype not corrupted
  })

  it('isNativeCommand rejects non-finite ids (they do not round-trip through JSON)', () => {
    expect(isNativeCommand({ type: 'createNode', id: Number.NaN, tag: 'view' })).toBe(false)
    expect(isNativeCommand({ type: 'disposeNode', id: Number.POSITIVE_INFINITY })).toBe(false)
    expect(isNativeCommand({ type: 'createNode', id: 5, tag: 'view' })).toBe(true) // finite is ok
  })
})
