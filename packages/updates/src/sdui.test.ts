import { isElement, type MindeesElement } from '@mindees/core'
import { describe, expect, it, vi } from 'vitest'
import {
  applyJsonPatch,
  applyMergePatch,
  compileSdui,
  type JsonPatchOp,
  type SduiJson,
  type SduiRegistry,
} from './sdui'

/** A test registry with a small allowlist + a stub bindings provider. */
function registry(over: Partial<SduiRegistry> = {}): SduiRegistry {
  return {
    components: { view: 'view', text: 'text', button: 'button' },
    bindings: (path) => () => `bound:${path}`,
    ...over,
  }
}

/** Assert a compiled node is an element and return it typed. */
const el = (v: unknown): MindeesElement => {
  if (!isElement(v)) throw new Error('expected an element')
  return v
}

describe('compileSdui — compilation', () => {
  it('compiles a nested tree to createElement output', () => {
    const tree = {
      schema: 1,
      tag: 'view',
      props: { id: 'root' },
      children: [{ schema: 1, tag: 'text', children: ['hello'] }],
    }
    const root = el(compileSdui(tree, registry()))
    expect(root.type).toBe('view')
    expect(root.props).toEqual({ id: 'root' })
    const child = el(root.children[0])
    expect(child.type).toBe('text')
    expect(child.children).toEqual(['hello'])
  })

  it('passes through key', () => {
    const root = el(compileSdui({ schema: 1, tag: 'view', key: 'k1' }, registry()))
    expect(root.key).toBe('k1')
  })

  it('rejects an unknown tag (and an inherited Object key as a tag)', () => {
    expect(() => compileSdui({ schema: 1, tag: 'script' }, registry())).toThrow(/allowlist/)
    // an inherited key like "constructor" must not resolve as a component
    expect(() => compileSdui({ schema: 1, tag: 'constructor' }, registry())).toThrow(/allowlist/)
  })

  it('rejects a bad schema, unknown node key, and non-array children', () => {
    expect(() => compileSdui({ schema: 2, tag: 'view' }, registry())).toThrow(/schema/)
    expect(() => compileSdui({ schema: 1, tag: 'view', onClick: 1 }, registry())).toThrow(
      /unknown node key/,
    )
    expect(() => compileSdui({ schema: 1, tag: 'view', children: 'nope' }, registry())).toThrow(
      /children/,
    )
  })
})

describe('compileSdui — actions', () => {
  it('compiles an $action prop to a handler invoked with args + event', () => {
    const inc = vi.fn()
    const root = el(
      compileSdui(
        { schema: 1, tag: 'button', props: { onPress: { $action: 'inc', args: { by: 2 } } } },
        registry({ actions: { inc } }),
      ),
    )
    const onPress = root.props.onPress as (...a: unknown[]) => void
    expect(typeof onPress).toBe('function')
    onPress('event-arg')
    expect(inc).toHaveBeenCalledWith({ by: 2 }, 'event-arg')
  })

  it('rejects an unknown action', () => {
    expect(() =>
      compileSdui(
        { schema: 1, tag: 'button', props: { onPress: { $action: 'missing' } } },
        registry({ actions: {} }),
      ),
    ).toThrow(/not registered/)
  })

  it('does NOT interpret a $action marker nested inside args (no self-promotion to a handler)', () => {
    const inc = vi.fn()
    el(
      compileSdui(
        {
          schema: 1,
          tag: 'button',
          props: { onPress: { $action: 'inc', args: { nested: { $action: 'evil' } } } },
        },
        registry({ actions: { inc } }),
      ),
    ).props.onPress as () => void
    // the compiled handler carries the nested object as plain data, not a function
    const root = el(
      compileSdui(
        {
          schema: 1,
          tag: 'button',
          props: { onPress: { $action: 'inc', args: { nested: { $action: 'evil' } } } },
        },
        registry({ actions: { inc } }),
      ),
    )
    ;(root.props.onPress as () => void)()
    expect(inc).toHaveBeenCalledWith({ nested: { $action: 'evil' } })
  })
})

describe('compileSdui — bindings', () => {
  it('resolves a $bind prop via the bindings provider (as a reactive accessor)', () => {
    const root = el(
      compileSdui({ schema: 1, tag: 'text', props: { value: { $bind: 'count' } } }, registry()),
    )
    const value = root.props.value as () => unknown
    expect(typeof value).toBe('function')
    expect(value()).toBe('bound:count')
  })

  it('rejects a $bind when no bindings provider is configured', () => {
    expect(() =>
      compileSdui(
        { schema: 1, tag: 'text', props: { value: { $bind: 'count' } } },
        { components: { text: 'text' } },
      ),
    ).toThrow(/no bindings/)
  })
})

describe('compileSdui — security (prototype pollution + limits)', () => {
  it('rejects a forbidden prop key without polluting Object.prototype', () => {
    // A real attack arrives as parsed JSON, where "__proto__" is an OWN data key
    // (an object literal's __proto__ would instead set the prototype, not a key).
    const malicious = JSON.parse(
      '{"schema":1,"tag":"view","props":{"__proto__":{"polluted":true}}}',
    )
    expect(() => compileSdui(malicious, registry())).toThrow(/forbidden/)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('rejects reserved structural prop names (key, children)', () => {
    expect(() => compileSdui({ schema: 1, tag: 'view', props: { key: 'x' } }, registry())).toThrow(
      /reserved/,
    )
    expect(() =>
      compileSdui(
        { schema: 1, tag: 'view', props: { children: [{ schema: 1, tag: 'text' }] } },
        registry(),
      ),
    ).toThrow(/reserved/)
  })

  it('rejects non-JSON prop values (functions, symbols)', () => {
    expect(() =>
      compileSdui({ schema: 1, tag: 'view', props: { n: () => 1 } }, registry()),
    ).toThrow(/unsupported value/)
  })

  it('rejects a marker object used as a child (children are node | string only)', () => {
    expect(() =>
      compileSdui(
        { schema: 1, tag: 'view', children: [{ $action: 'x' }] },
        registry({ actions: { x: () => {} } }),
      ),
    ).toThrow(/unknown node key/)
  })

  it('counts nested prop/args values against the node budget (DoS amplification)', () => {
    const wide = {
      schema: 1,
      tag: 'view',
      props: { data: Array.from({ length: 10 }, (_, i) => i) },
    }
    expect(() => compileSdui(wide, registry({ limits: { maxNodes: 3 } }))).toThrow(/max nodes/)
  })

  it('enforces maxNodes, maxDepth, and maxStringLength', () => {
    const many = {
      schema: 1,
      tag: 'view',
      children: Array.from({ length: 5 }, () => ({ schema: 1, tag: 'text' })),
    }
    expect(() => compileSdui(many, registry({ limits: { maxNodes: 3 } }))).toThrow(/max nodes/)

    let deep: SduiJson = { schema: 1, tag: 'text' } as unknown as SduiJson
    for (let i = 0; i < 5; i++)
      deep = { schema: 1, tag: 'view', children: [deep] } as unknown as SduiJson
    expect(() => compileSdui(deep, registry({ limits: { maxDepth: 2 } }))).toThrow(/max depth/)

    const big = { schema: 1, tag: 'text', children: ['x'.repeat(20)] }
    expect(() => compileSdui(big, registry({ limits: { maxStringLength: 5 } }))).toThrow(
      /max length/,
    )
  })
})

describe('applyMergePatch (RFC 7396)', () => {
  it('merges objects, deletes via null, and replaces arrays/primitives', () => {
    const target: SduiJson = { a: 1, b: { c: 2, d: 3 }, list: [1, 2] }
    const result = applyMergePatch(target, { b: { c: 20, d: null }, list: [9], e: 5 })
    expect(result).toEqual({ a: 1, b: { c: 20 }, list: [9], e: 5 })
    expect(target).toEqual({ a: 1, b: { c: 2, d: 3 }, list: [1, 2] }) // input untouched
  })

  it('rejects a prototype-pollution key', () => {
    const patch = JSON.parse('{"__proto__":{"x":1}}') // own "__proto__" key, as from the wire
    expect(() => applyMergePatch({}, patch)).toThrow(/forbidden/)
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })

  it('fails closed (SduiError, not RangeError) on a pathologically deep patch', () => {
    let deep: SduiJson = 0
    for (let i = 0; i < 1100; i++) deep = { x: deep }
    expect(() => applyMergePatch({}, deep)).toThrow(/max depth/)
  })
})

describe('applyJsonPatch (safe RFC 6902 subset)', () => {
  const doc: SduiJson = { a: 1, nested: { b: 2 }, list: ['x', 'y'] }

  it('supports add / remove / replace on objects and arrays', () => {
    expect(applyJsonPatch(doc, [{ op: 'add', path: '/c', value: 3 }])).toMatchObject({ c: 3 })
    expect(applyJsonPatch(doc, [{ op: 'replace', path: '/a', value: 9 }])).toMatchObject({ a: 9 })
    expect(applyJsonPatch(doc, [{ op: 'remove', path: '/a' }])).not.toHaveProperty('a')
    expect(applyJsonPatch(doc, [{ op: 'add', path: '/list/-', value: 'z' }])).toMatchObject({
      list: ['x', 'y', 'z'],
    })
    expect(applyJsonPatch(doc, [{ op: 'replace', path: '/list/0', value: 'X' }])).toMatchObject({
      list: ['X', 'y'],
    })
    expect(doc).toEqual({ a: 1, nested: { b: 2 }, list: ['x', 'y'] }) // input untouched
  })

  it('decodes escaped pointer segments (~1 → /, ~0 → ~)', () => {
    const d: SduiJson = { 'a/b': 1, 'c~d': 2 }
    expect(applyJsonPatch(d, [{ op: 'replace', path: '/a~1b', value: 9 }])).toMatchObject({
      'a/b': 9,
    })
    expect(applyJsonPatch(d, [{ op: 'replace', path: '/c~0d', value: 8 }])).toMatchObject({
      'c~d': 8,
    })
  })

  it('rejects unsupported ops, missing targets, and forbidden segments', () => {
    expect(() =>
      applyJsonPatch(doc, [{ op: 'move', path: '/a', from: '/b' } as unknown as JsonPatchOp]),
    ).toThrow(/unsupported op/)
    expect(() => applyJsonPatch(doc, [{ op: 'replace', path: '/missing', value: 1 }])).toThrow(
      /not found/,
    )
    expect(() => applyJsonPatch(doc, [{ op: 'remove', path: '/missing' }])).toThrow(/not found/)
    expect(() => applyJsonPatch(doc, [{ op: 'add', path: '/__proto__/x', value: 1 }])).toThrow(
      /forbidden/,
    )
    expect(() =>
      applyJsonPatch(doc, [{ op: 'add', path: '/a', value: undefined } as unknown as JsonPatchOp]),
    ).toThrow(/requires a value/)
  })

  it('fails closed on a malformed op envelope (not a raw TypeError)', () => {
    expect(() => applyJsonPatch(doc, 'nope' as unknown as JsonPatchOp[])).toThrow(
      /ops must be an array/,
    )
    expect(() => applyJsonPatch(doc, [null as unknown as JsonPatchOp])).toThrow(/must be an object/)
    expect(() => applyJsonPatch(doc, [{ op: 'add', value: 1 } as unknown as JsonPatchOp])).toThrow(
      /string path/,
    )
  })

  it('can replace the whole document at the empty path', () => {
    expect(applyJsonPatch(doc, [{ op: 'replace', path: '', value: { fresh: true } }])).toEqual({
      fresh: true,
    })
  })
})
