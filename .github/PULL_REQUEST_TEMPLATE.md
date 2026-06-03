<!--
Thanks for contributing to MindeesNative!
Keep PRs small and focused. Make sure `pnpm verify` is green.
-->

## What shipped

<!-- A concise description of the change and why. -->

## Research track?

<!--
Per the Working-Code Doctrine, does this PR introduce or touch anything that is
NOT fully working yet? If so, confirm it is honestly labeled:
- throws NotImplementedError, marked @experimental, listed in STATUS.md.
Write "None" if everything in this PR fully works.
-->

- [ ] Nothing in this PR is a stub/lie. Anything not-yet-working is a labeled research track.

## What I researched / verified

<!--
Versions, APIs, or facts you verified for this change, with source URLs.
Example: "Verified turbo X.Y is current; `tasks` key (not `pipeline`). Source: ..."
-->

## How to run / observe it

<!-- Commands or steps a reviewer can use to see this work. -->

## Checklist

- [ ] `pnpm verify` passes locally (lint + typecheck + build + exports + CLI smoke + test)
- [ ] Tests added/updated (new behavior has tests; bug fixes have a regression test)
- [ ] Public symbols have TSDoc
- [ ] Added a changeset (`pnpm changeset`) if this changes a published package
- [ ] Commits follow Conventional Commits and are signed off (`-s`, DCO)
- [ ] Docs / `STATUS.md` updated if maturity changed
