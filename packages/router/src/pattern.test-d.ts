import { expectTypeOf } from 'expect-type'
import type { HasPathParams, PathParams } from './pattern'

// Static-only patterns contribute no params.
expectTypeOf<HasPathParams<'/about'>>().toEqualTypeOf<false>()
expectTypeOf<HasPathParams<'/'>>().toEqualTypeOf<false>()

// A single dynamic segment.
expectTypeOf<HasPathParams<'/posts/:postId'>>().toEqualTypeOf<true>()
expectTypeOf<keyof PathParams<'/posts/:postId'>>().toEqualTypeOf<'postId'>()
expectTypeOf<PathParams<'/posts/:postId'>['postId']>().toEqualTypeOf<string>()

// Multiple dynamic segments.
expectTypeOf<PathParams<'/u/:userId/p/:postId'>>().toEqualTypeOf<{
  userId: string
  postId: string
}>()

// A catch-all segment is a single string param.
expectTypeOf<PathParams<'/files/:rest*'>>().toEqualTypeOf<{ rest: string }>()

// Static segments around a param do not leak keys.
expectTypeOf<keyof PathParams<'/posts/:postId/comments'>>().toEqualTypeOf<'postId'>()
