# Migrating to MindeesNative 1.0

1.0 freezes the public API of the **web-stable** packages under semver. Getting there meant a focused
pre-freeze cleanup (see [ADR-0025](./adr/0025-tree-scoped-context.md) and the freeze audit). This guide lists
every behavior change from the `0.3x` line. Most apps need only the rename + import moves below.

## Errors

- **All framework errors now extend `MindeesError`** (exported from `@mindees/core`), which carries a stable
  `name` + machine-readable `code`. You can now `catch (e) { if (e instanceof MindeesError) … }` across every
  package and branch on `e.code`. `instanceof AiError`/`RouterError`/… still works — this is additive.
- **`useRouter()`** (and the hooks built on it) now throws `RouterError('NO_ACTIVE_ROUTER')` instead of a
  bare `Error`.
- **`createList`/`useForm`** now throw `AtlasError` (codes `INVALID_PROP`/`ASYNC_SCHEMA`) instead of a bare
  `RangeError`/`TypeError`. If you were catching `RangeError`/`TypeError`, catch `AtlasError` (or
  `MindeesError`).
- **`SduiErrorCode`** dropped its redundant `SDUI_` prefix (`'SDUI_LIMIT'` → `'LIMIT'`, etc.) to match its
  peers. **`NativeHostError`** is now constructed `(code, message)` and exposes a `NativeHostErrorCode`.

## Renames & moved exports

- **GPU canvas backend** (research stub): `createCanvasBackend`/`CanvasBackend` →
  `createGpuCanvasBackend`/`GpuCanvasBackend` (so it no longer collides with the implemented
  `createCanvas2DBackend`).
- **File-based routing** scans **`src/app/`** (Expo-style), not `src/routes/`. Move your route files and
  re-run `mindees dev`/`build` (it regenerates `src/routes.gen.ts`).
- **Test-only engine helpers** moved off `@mindees/core`'s root to **`@mindees/core/testing`**
  (`_resetAnimation`, `_activeAnimationCount`, `_setGestureClock`). Import them only in test setup.
- **Low-level crypto primitives** (`sign`/`verify`/`sha256Hex`/`toHex`/`fromHex`/`utf8`) are no longer
  exported from `@mindees/updates`'s root — use `signManifest`/`verifySignedManifest`/`parseManifest`
  (`generateKeypair`/`getPublicKey` remain).

## Removed internals (were never meant to be public)

`@mindees/compiler` `createFlattenTransformer`/`STATIC_MARKER` (use `compile`/`compileChecked`),
`@mindees/renderer` `isEventProp`, and `create-mindees`'s re-export of `naturalLanguageToTemplate` (import
from `@mindees/cli` if you need it) are no longer exported.

## Newly exported types

Several previously-unnameable public types are now exported: `@mindees/cli` `DevServerResponse` +
`MindeesConfig`/`loadConfig`/`CONFIG_FILE`; `@mindees/renderer` `SerializeOptions`/`HeadlessBackendOptions`/
`Canvas2DBackendOptions`; `@mindees/data` `RecordState`/`AbortLike`; `@mindees/atlas` `Entry`. No action
needed — these only make existing APIs annotatable.

## Maturity

The **web stack** — `@mindees/core`, `@mindees/compiler`, `@mindees/cli`, `@mindees/router`,
`@mindees/renderer`, `@mindees/atlas` — is now `maturity: 'stable'` and follows semver. `@mindees/ai`,
`@mindees/data`, and `@mindees/updates` share the 1.0 version line but remain `maturity: 'experimental'`
(feature-complete and tested, still stabilizing their surface). On-device **native** rendering remains a
labeled research track. See [`STATUS.md`](../STATUS.md).
