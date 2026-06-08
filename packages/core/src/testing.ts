/**
 * Test-only helpers — the `@mindees/core/testing` subpath.
 *
 * These reach into process-global engine state (the animation frame source, the gesture clock) to make
 * deterministic tests possible. They are NOT part of the runtime API and must never run in a shipping app —
 * calling them can corrupt a live frame loop. Kept off the package root so they can't leak into app code;
 * import them only from test setup.
 *
 * @module
 */

export { _activeAnimationCount, _resetAnimation } from './animation'
export { _setGestureClock } from './gesture'
