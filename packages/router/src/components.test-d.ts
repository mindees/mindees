import type { MindeesNode } from '@mindees/core'
import { expectTypeOf } from 'expect-type'
import { createLink, createRouterView } from './components'
import { createMemoryHistory } from './history'
import { createRouter } from './router'

const router = createRouter({
  routes: [{ path: '/about' }, { path: '/posts/:postId' }],
  history: createMemoryHistory(),
})

// createRouterView returns a renderable node.
expectTypeOf(createRouterView(router)).toEqualTypeOf<MindeesNode>()

const Link = createLink(router)

// Static target: params may be omitted.
Link({ to: '/about', children: 'About' })

// Dynamic target: params required and typed.
Link({ to: '/posts/:postId', params: { postId: '1' } })

// @ts-expect-error — missing required params for a dynamic pattern.
Link({ to: '/posts/:postId' })

// @ts-expect-error — wrong param name.
Link({ to: '/posts/:postId', params: { wrong: '1' } })

// @ts-expect-error — params not allowed on a static pattern.
Link({ to: '/about', params: { x: '1' } })
