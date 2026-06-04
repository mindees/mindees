import { expectTypeOf } from 'expect-type'
import {
  computed,
  effect,
  getOwner,
  type Memo,
  type Owner,
  type Signal,
  signal,
  untrack,
} from './reactive'

// signal() returns a Signal<T> with the expected shape and inferred T.
const count = signal(0)
expectTypeOf(count).toEqualTypeOf<Signal<number>>()
expectTypeOf(count()).toEqualTypeOf<number>()
expectTypeOf(count.set).parameter(0).toEqualTypeOf<number>()
expectTypeOf(count.set(1)).toEqualTypeOf<number>()
expectTypeOf(count.update).parameter(0).toEqualTypeOf<(prev: number) => number>()
expectTypeOf(count.peek()).toEqualTypeOf<number>()

// inference from the initial value
const name = signal('hi')
expectTypeOf(name()).toEqualTypeOf<string>()

// computed() returns Memo<T> with the inferred return type.
const doubled = computed(() => count() * 2)
expectTypeOf(doubled).toEqualTypeOf<Memo<number>>()
expectTypeOf(doubled()).toEqualTypeOf<number>()
expectTypeOf(doubled.peek()).toEqualTypeOf<number>()

// effect() returns a disposer.
expectTypeOf(effect(() => {})).toEqualTypeOf<() => void>()

// untrack() preserves the callback's return type.
expectTypeOf(untrack(() => count())).toEqualTypeOf<number>()

// Owner is an OPAQUE, NOMINAL handle: getOwner() yields it, but it does not leak
// the internal type-erased Computation graph (no `any`, no internal fields), and
// it cannot be fabricated from a structural object literal — so a malformed owner
// can never reach runWithOwner and crash onCleanup/adopt.
expectTypeOf(getOwner()).toEqualTypeOf<Owner | null>()
// @ts-expect-error - Owner is nominal; a plain object is not assignable to it.
const _fabricated: Owner = {}
void _fabricated
