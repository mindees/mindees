import { describe, expect, it } from 'vitest'
import { isSerializable } from './backend'
import { createHeadlessBackend } from './headless'

// Regression: serialize() is typed as a plain function member on the public
// SerializableBackend interface, so a consumer may legally detach it
// (`const { serialize } = backend`). It must not depend on a dynamic `this`.
describe('headless backend — serialize is binding-independent', () => {
  it('works when detached from the backend object', () => {
    const backend = createHeadlessBackend()
    const el = backend.createElement('view')
    backend.insert(el, backend.createText('hi'), null) // a child forces recursion
    expect(isSerializable(backend)).toBe(true)

    const { serialize } = backend // legal per the SerializableBackend type
    expect(() => serialize(el)).not.toThrow()
    expect(serialize(el)).toBe('<view>hi</view>')
  })

  it('escapes attribute values and drops unsafe attribute names', () => {
    const backend = createHeadlessBackend()
    const el = backend.createElement('view')
    backend.setProp(el, 'title', 'a"b<c', undefined)
    backend.setProp(el, 'x><script>', 'y', undefined) // unsafe name
    expect(backend.serialize(el)).toBe('<view title="a&quot;b&lt;c"></view>')
  })
})

describe('headless SSR — style serialization matches the DOM', () => {
  it('serializes a style object to kebab-case CSS with px units (not camelCase/unitless)', () => {
    const b = createHeadlessBackend()
    const el = b.createElement('view')
    b.setProp(el, 'style', { backgroundColor: 'red', marginTop: 8, opacity: 0.5 }, undefined)
    expect(b.serialize(el)).toBe(
      '<view style="background-color:red;margin-top:8px;opacity:0.5"></view>',
    )
  })

  it('drops nullish / non-finite style values', () => {
    const b = createHeadlessBackend()
    const el = b.createElement('view')
    b.setProp(
      el,
      'style',
      { width: 10, height: null, color: undefined, opacity: Number.NaN },
      undefined,
    )
    expect(b.serialize(el)).toBe('<view style="width:10px"></view>')
  })
})

describe('headless backend — attribute serialization parity', () => {
  it('does not CSS-mangle a non-style object prop (matches the DOM backend String(value))', () => {
    const backend = createHeadlessBackend()
    const el = backend.createElement('view')
    backend.setProp(el, 'data-config', { foo: 'bar', baz: 1 }, undefined)
    const html = backend.serialize(el)
    expect(html).toContain('data-config="[object Object]"') // same as the DOM backend's String(value)
    expect(html).not.toContain('foo:bar') // the CSS serializer must NOT run on a non-style prop
  })
})
