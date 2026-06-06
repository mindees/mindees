import { describe, expect, it } from 'vitest'
import { perfLint } from './perf-lint'
import { compileChecked } from './transform'
import { hasErrors } from './typecheck'

const codes = (src: string, opts = {}) => perfLint(src, 'm.tsx', opts).map((d) => d.code)

describe('perf-lint', () => {
  it('is off by default in compileChecked, on with { perf: true }', () => {
    const src =
      'const f = (items: {id:string}[]) => <view>{items.map((i) => <text>{i.id}</text>)}</view>'
    expect(compileChecked(src).diagnostics.some((d) => d.code.startsWith('MDC_PERF'))).toBe(false)
    const on = compileChecked(src, { perf: true }).diagnostics.filter((d) =>
      d.code.startsWith('MDC_PERF'),
    )
    expect(on.some((d) => d.code === 'MDC_PERF_001')).toBe(true)
    expect(on[0]?.position?.line).toBeGreaterThan(0) // real raw-TSX position
  })

  describe('MDC_PERF_001 — bare .map JSX child', () => {
    it('flags a .map child that returns JSX', () => {
      expect(
        codes('const f = (xs:any[]) => <view>{xs.map((x) => <text>{x}</text>)}</view>'),
      ).toContain('MDC_PERF_001')
    })
    it('does NOT flag a .map returning a non-JSX value', () => {
      expect(
        codes('const f = (xs:any[]) => <view>{xs.map((x) => x.name).join(",")}</view>'),
      ).not.toContain('MDC_PERF_001')
    })
    it('does NOT flag For/List calls', () => {
      const src =
        'const f = (xs:any[]) => For({ each: () => xs, key: (x:any) => x.id, children: (x:any) => <text>{x}</text> })'
      expect(codes(src)).not.toContain('MDC_PERF_001')
    })
  })

  describe('MDC_PERF_002 — missing key', () => {
    it('flags For/keyedRegion with no key', () => {
      expect(
        codes('const r = keyedRegion({ each: () => rows(), children: (x:any) => x })'),
      ).toContain('MDC_PERF_002')
      expect(codes('const r = For({ each: () => rows(), children: (x:any) => x })')).toContain(
        'MDC_PERF_002',
      )
    })
    it('does NOT flag when a key is present or args are spread', () => {
      expect(
        codes(
          'const r = For({ each: () => rows(), key: (x:any) => x.id, children: (x:any) => x })',
        ),
      ).not.toContain('MDC_PERF_002')
      expect(codes('const r = For({ ...opts })')).not.toContain('MDC_PERF_002')
    })
  })

  describe('MDC_PERF_003 — heavy work in a sync effect', () => {
    it('flags a loop over a read signal in a default effect', () => {
      const src =
        'const data = signal<number[]>([]); effect(() => { let t=0; for (const x of data()) t += x })'
      expect(codes(src)).toContain('MDC_PERF_003')
    })
    it('does NOT flag the deferred (normal-lane) form', () => {
      const src =
        "const data = signal<number[]>([]); effect(() => { for (const x of data()) {} }, { priority: 'normal' })"
      expect(codes(src)).not.toContain('MDC_PERF_003')
    })
    it('does NOT flag a light effect', () => {
      expect(codes('const c = signal(0); effect(() => console.log(c()))')).not.toContain(
        'MDC_PERF_003',
      )
    })
  })

  describe('MDC_PERF_004 — repeated read in a loop', () => {
    it('flags the same accessor read twice in a loop', () => {
      const src =
        'const items = signal<any[]>([]); for (let i=0;i<3;i++){ use(items()[i]); log(items()) }'
      expect(codes(src)).toContain('MDC_PERF_004')
    })
    it('does NOT flag a hoisted read', () => {
      const src =
        'const items = signal<any[]>([]); const xs = items(); for (let i=0;i<3;i++){ use(xs[i]) }'
      expect(codes(src)).not.toContain('MDC_PERF_004')
    })
  })

  describe('MDC_PERF_005 — effect subscribes without cleanup', () => {
    it('flags addEventListener with no cleanup', () => {
      expect(codes("effect(() => { window.addEventListener('resize', h) })")).toContain(
        'MDC_PERF_005',
      )
    })
    it('does NOT flag when a teardown is returned or onCleanup is used', () => {
      expect(
        codes('effect(() => { const id = setInterval(t, 1000); return () => clearInterval(id) })'),
      ).not.toContain('MDC_PERF_005')
      expect(
        codes(
          "effect(() => { window.addEventListener('resize', h); onCleanup(() => window.removeEventListener('resize', h)) })",
        ),
      ).not.toContain('MDC_PERF_005')
    })
    it('does NOT flag when a teardown is returned by name', () => {
      expect(
        codes(
          "effect(() => { window.addEventListener('resize', h); const teardown = () => window.removeEventListener('resize', h); return teardown })",
        ),
      ).not.toContain('MDC_PERF_005')
      expect(
        codes('effect(() => { const unsub = store.subscribe(fn); return unsub })'),
      ).not.toContain('MDC_PERF_005')
    })
  })

  describe('MDC_PERF_006 — constant function-valued prop', () => {
    it('flags a style fn that returns a constant object (no signal read)', () => {
      expect(codes('const f = () => <view style={() => ({ padding: 8 })} />')).toContain(
        'MDC_PERF_006',
      )
    })
    it('does NOT flag a style fn that reads a signal (the real theme case)', () => {
      expect(
        codes(
          'const theme = useTheme(); const f = () => <view style={() => ({ color: theme().color })} />',
        ),
      ).not.toContain('MDC_PERF_006')
    })
    it('does NOT flag a style fn reading an accessor via prop / param / select / destructure', () => {
      expect(
        codes(
          'function Badge(props:{active:()=>boolean}){ return <view style={() => ({ opacity: props.active() ? 1 : 0.5 })} /> }',
        ),
      ).not.toContain('MDC_PERF_006')
      expect(
        codes('const Row = ({theme}:any) => <view style={() => ({ color: theme().color })} />'),
      ).not.toContain('MDC_PERF_006')
      expect(
        codes(
          'const mode = provider.select((t:any)=>t.mode)\nconst Row = () => <view style={() => ({ background: mode() })} />',
        ),
      ).not.toContain('MDC_PERF_006')
      expect(
        codes(
          'const [count]=useCounter()\nconst Row = () => <view style={() => ({ width: count() })} />',
        ),
      ).not.toContain('MDC_PERF_006')
    })
  })

  it('MDC_PERF_007 is off by default and on when enabled', () => {
    const children = Array.from({ length: 60 }, () => '<view />').join('')
    const src = `const f = () => <view>${children}</view>`
    expect(codes(src)).not.toContain('MDC_PERF_007')
    expect(codes(src, { rules: { MDC_PERF_007: 'warning' } })).toContain('MDC_PERF_007')
  })

  it('supports suppression comments and per-rule off', () => {
    const src =
      'const f = (xs:any[]) => <view>\n{/* mdc-perf-ignore MDC_PERF_001 */}\n{xs.map((x) => <text>{x}</text>)}</view>'
    expect(codes(src)).not.toContain('MDC_PERF_001')
    const src2 = 'const f = (xs:any[]) => <view>{xs.map((x) => <text>{x}</text>)}</view>'
    expect(codes(src2, { rules: { MDC_PERF_001: 'off' } })).not.toContain('MDC_PERF_001')
  })

  it('never blocks the build (all warnings)', () => {
    const src = 'const f = (xs:any[]) => <view>{xs.map((x) => <text>{x}</text>)}</view>'
    const result = compileChecked(src, { perf: true })
    expect(result.code.length).toBeGreaterThan(0) // emitted (not gated)
    expect(hasErrors(result.diagnostics)).toBe(false)
  })

  it('runs effect/loop rules on a .ts file (no JSX) without throwing', () => {
    const src = 'const c = signal(0); effect(() => { for (const x of c()) {} })'
    expect(() => perfLint(src, 'm.ts')).not.toThrow()
    expect(perfLint(src, 'm.ts').map((d) => d.code)).toContain('MDC_PERF_003')
  })
})
