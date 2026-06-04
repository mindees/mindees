---
"@mindees/updates": patch
---

Security/audit hardening for `@mindees/updates` (Pulse). An adversarial security review of the signing, crypto, delta, SDUI, server, and store layers confirmed two defects (the Ed25519 signing, delta codec, and content-addressed store held up); both are fixed with regression tests:

- **Anti-downgrade gate at apply (medium)** — `apply()` used `version < highestVersion`, while `download()`/`check()`/the server all enforce a `<=` floor. That let a *different* bundle signed at the *same* version laterally replace a confirmed-good current generation (a same-version signed-downgrade / lateral-move vector). `apply()` now rejects activating a different bundle once the high-water mark has reached that version, while still allowing an idempotent re-apply of the already-current generation.
- **SDUI merge-patch prototype pollution (medium)** — `applyMergePatch`'s base-copy loop lacked the `__proto__`/`constructor`/`prototype` guard that every other tree walk in the module has, so an own `__proto__` key in the *base* document (e.g. from `JSON.parse` of the prior OTA doc) corrupted the returned object's prototype via the `__proto__` setter — contradicting the module's "prototype-pollution-safe" guarantee. The base-copy loop now rejects forbidden keys like the patch loop does.

Also freezes the exported `info` object (consistency with `@mindees/core`/`@mindees/renderer`).
