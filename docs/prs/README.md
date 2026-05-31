# Phase pull-request descriptions

When automated GitHub PR creation is not available (e.g. CLI auth is not
configured), the PR **title** and **description** for each phase are written
here as `phase-<N>.md`, alongside a local branch + commit. Once GitHub access is
restored, these files can be used verbatim to open the corresponding PR.

| File | Phase | Branch |
| ---- | ----- | ------ |
| `phase-0.md` | Phase 0 — Repository, governance & toolchain foundation | `phase/0-foundations` |
