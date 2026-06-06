---
"@mindees/atlas": minor
---

Add **`useForm`** — a built-in form-state hook with **Standard Schema** validation (Zod/Valibot/
ArkType/…), the thing RN and Flutter make you reach for react-hook-form / formik to get. Signal-backed
`values`/`errors`/`touched` (a field binding re-renders only itself), `field(name)` bindings
(value/error/touched/set/onBlur), `validate()`, `handleSubmit()` (validates, marks all touched, calls
`onSubmit` only if valid), `reset()`, and reactive `isValid`/`isSubmitting`. Validation is synchronous
(an async schema is rejected, mirroring the router) and maps each issue to its field by path.
