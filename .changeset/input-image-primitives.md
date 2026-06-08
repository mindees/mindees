---
"@mindees/atlas": minor
---

**Table-stakes `TextInput` + `Image` props** (roadmap #5) — you can now build real login/checkout/comment
screens and image-heavy lists.

- **TextInput:** `multiline` (renders a real `<textarea>` with `rows`), `secureTextEntry` (→ password),
  `keyboardType` (→ `inputmode`), `returnKeyType` (→ `enterkeyhint`), `autoCapitalize`, `autoComplete`,
  `maxLength`, `autoFocus`, `onFocus`/`onBlur`, and `onSubmitEditing` (fires on Enter with the value).
- **Image:** `resizeMode` (→ CSS `object-fit`), `loading` (lazy), `decoding`, `fetchPriority`,
  intrinsic `width`/`height` (reserve layout space), `onLoad`/`onError`, and `fallbackSrc` (swaps the
  element's `src` on a load error). The native disk/memory cache stays a host contract (deferred).
