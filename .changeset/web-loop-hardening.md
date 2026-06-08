---
"@mindees/compiler": minor
"@mindees/cli": patch
"@mindees/atlas": patch
---

Harden the web build + Image after an adversarial review of the shipped web-run-loop (two real defects):

- **compiler/cli:** the relative-import `.js` rewrite was a regex that **corrupted** valid code — it
  injected `.js` into a concatenated dynamic import (`import('./p/' + name)` → `import('./p/.js' + name)`),
  mangled import-like text inside string literals, and turned a directory/barrel import (`./widgets`) into
  `./widgets.js` (404) instead of `./widgets/index.js`. Replaced with a new **AST-based**
  `rewriteImportSpecifiers` (exported from `@mindees/compiler`): it touches only real import/export and
  single-string-literal dynamic-import specifiers, and the CLI resolves directory imports to `/index.js`
  against the compiled source set.
- **atlas:** `Image` `fallbackSrc` looped forever — the live `src` is an absolute URL that never equals the
  literal fallback, so it re-swapped and re-fired `onError` on every error event. It now swaps exactly once
  (guarded by a marker). A multiline `TextInput` also no longer emits a stray `type` attribute on the `<textarea>`.
