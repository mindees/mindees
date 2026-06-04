/**
 * The example app — file-based routing, `@mindees/*` only, plain TSX.
 *
 * Routes live in `app/` (app/index.tsx → `/`, app/about.tsx → `/about`); the screens
 * use the `useRouter()` hook (no router prop-drilling). `createFileRouter` turns the
 * module map into a Quantum router with Expo-style conventions but a stronger core
 * (validated params, fine-grained reads, codegen-free typing).
 *
 * @module
 */

import { Column } from '@mindees/atlas'
import { createFileRouter, createMemoryHistory, createRouterView } from '@mindees/router'
import * as aboutRoute from './app/about'
import * as indexRoute from './app/index'
import { screenStyle } from './theme'

// The file-based route map. A bundler glob (`import.meta.glob('./app/**')`) or a
// `mindees build` codegen produces this automatically; it's explicit here because the
// QuickJS bundle has no `import.meta.glob`.
const router = createFileRouter(
  {
    'index.tsx': indexRoute,
    'about.tsx': aboutRoute,
  },
  { history: createMemoryHistory({ initialEntries: ['/'] }) },
)

/** Full-screen shell: dark background, centers the active route's card. */
export function App() {
  return <Column style={screenStyle}>{createRouterView(router)}</Column>
}
