import { expectTypeOf } from 'expect-type'
import { z } from 'zod'
import { createMemoryHistory } from './history'
import { createRouter } from './router'
import { validateSearch } from './search'

const router = createRouter({
  routes: [{ path: '/about' }, { path: '/posts/:postId' }],
  history: createMemoryHistory(),
})

// A relative/absolute href string is always allowed.
router.navigate('/posts/1')
router.navigate('./edit')

// Structured target with a param-bearing pattern requires the right params.
router.navigate({ to: '/posts/:postId', params: { postId: '1' } })

// Static pattern: params may be omitted.
router.navigate({ to: '/about' })

// @ts-expect-error — missing required params for a dynamic pattern.
router.navigate({ to: '/posts/:postId' })

// @ts-expect-error — wrong param name.
router.navigate({ to: '/posts/:postId', params: { wrong: '1' } })

// @ts-expect-error — params not allowed on a static pattern.
router.navigate({ to: '/about', params: { x: '1' } })

// select() returns an accessor of the selected slice.
const postId = router.select((s) => s.params.postId)
// params is Record<string, string>, so an index read is string | undefined.
expectTypeOf(postId).toEqualTypeOf<() => string | undefined>()

const pathname = router.select((s) => s.pathname)
expectTypeOf(pathname).toEqualTypeOf<() => string>()

// validateSearch infers the schema's output type (zero codegen).
const search = validateSearch(z.object({ page: z.number(), q: z.string() }), {})
expectTypeOf(search).toEqualTypeOf<{ page: number; q: string }>()
