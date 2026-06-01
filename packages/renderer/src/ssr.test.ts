// @vitest-environment happy-dom
import { createElement as h, signal } from '@mindees/core'
import { describe, expect, it } from 'vitest'
import { hydrate, renderToString } from './ssr'

describe('renderToString (SSR)', () => {
  it('serializes a static tree to crawlable HTML', () => {
    const html = renderToString(h('view', { id: 'root' }, h('text', null, 'SEO-friendly')))
    expect(html).toBe('<div id="root"><span>SEO-friendly</span></div>')
  })

  it('renders a component to string', () => {
    const Page = (p: { title: string }) => h('view', null, h('text', null, p.title))
    const html = renderToString(Page, { title: 'MindeesNative' })
    expect(html).toBe('<div><span>MindeesNative</span></div>')
  })

  it('renders the initial value of a reactive child once', () => {
    const n = signal(7)
    const html = renderToString(h('view', null, () => n()))
    expect(html).toBe('<div>7</div>')
  })

  it('treats a top-level accessor node as a node, not a component', () => {
    // Regression: MindeesNode includes `() => MindeesNode`, so dispatch must not
    // misclassify a 1-arg accessor call as the component form.
    const n = signal(3)
    const html = renderToString(() => h('view', null, () => n()))
    expect(html).toBe('<div>3</div>')
  })

  it('escapes text and attribute values', () => {
    const html = renderToString(h('view', { title: 'a"b' }, '<script>'))
    expect(html).toBe('<div title="a&quot;b">&lt;script&gt;</div>')
  })
})

describe('hydrate', () => {
  it('produces a live, reactive DOM tree matching the server HTML', () => {
    // Server render.
    const view = (count: ReturnType<typeof signal<number>>) =>
      h('view', { id: 'app' }, () => `count: ${count()}`)
    const ssrCount = signal(0)
    const serverHtml = renderToString(view(ssrCount))
    expect(serverHtml).toBe('<div id="app">count: 0</div>')

    // Client: put server HTML in a container, then hydrate.
    const container = document.createElement('div')
    container.innerHTML = serverHtml
    const clientCount = signal(0)
    const m = hydrate(container as never, view(clientCount), { document: document as never })

    expect(container.textContent).toBe('count: 0')
    clientCount.set(5) // reactivity is now live on the client
    expect(container.textContent).toBe('count: 5')

    m.dispose()
    expect(container.childNodes.length).toBe(0)
  })

  it('honors the options.document for a node + options call (dispatch regression)', () => {
    // node-form hydrate with an explicit document must not treat options as props.
    const container = document.createElement('div')
    container.innerHTML = renderToString(h('view', null, 'x'))
    const m = hydrate(container as never, h('view', null, 'x'), { document: document as never })
    expect(container.textContent).toBe('x')
    m.dispose()
  })

  it('hydrates a component + props', () => {
    const Counter = (p: { start: number }) => {
      const n = signal(p.start)
      return h('view', { onClick: () => n.set(n() + 1) }, () => `${n()}`)
    }
    const container = document.createElement('div')
    container.innerHTML = renderToString(Counter, { start: 3 })
    expect(container.textContent).toBe('3')

    hydrate(container as never, Counter, { start: 3 }, { document: document as never })
    const div = container.firstElementChild as HTMLElement
    expect(div.textContent).toBe('3')
    div.dispatchEvent(new Event('click'))
    expect(div.textContent).toBe('4') // interactive after hydration
  })
})
