# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets).
It records intent-to-release: each change that affects a published package adds a
small markdown file here describing the bump (major/minor/patch) and a summary.

All `@mindees/*` packages (and `create-mindees`) are a **fixed group** — they
share one locked version line and are released together.

## Adding a changeset

```bash
pnpm changeset
```

Select the change type and write a human-readable summary, then commit the
generated file alongside your PR. See
[CONTRIBUTING.md](../CONTRIBUTING.md#releasing-maintainers) for the full flow.
