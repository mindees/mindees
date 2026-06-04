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

// Owner is an OPAQUE handle: getOwner() returns it, but it must not leak the
// internal, type-erased Computation graph (no `any`, no internal fields) into the
// public type surface — its `owned` is `unknown`, not `Computation<any>[]`.
expectTypeOf(getOwner()).toEqualTypeOf<Owner | null>()
expectTypeOf<Owner['owned']>().toEqualTypeOf<unknown>()
