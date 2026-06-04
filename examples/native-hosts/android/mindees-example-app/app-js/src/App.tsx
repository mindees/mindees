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

import { Column, space, useTheme } from '@mindees/atlas'
import { createFileRouter, createMemoryHistory, createRouterView } from '@mindees/router'
import { routes } from './routes.gen'

// `routes` is generated from the `app/` directory (scripts/gen-routes.mjs +
// @mindees/compiler `generateRouteModule`), so adding a file under `app/` adds a route
// with no edits here. createFileRouter applies the Expo-style conventions.
const router = createFileRouter(routes, {
  history: createMemoryHistory({ initialEntries: ['/'] }),
})

/** Full-screen shell: themed background (re-themes light↔dark), centers the active route. */
export function App() {
  const theme = useTheme()
  return (
    <Column
      style={() => ({
        flexGrow: 1,
        width: '100%',
        padding: space.lg,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme().color.bg,
      })}
    >
      {createRouterView(router)}
    </Column>
  )
}
