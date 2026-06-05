---
"@mindees/cli": minor
---

The `mindees` CLI now greets you with a friendly **branded banner** — the MindeesNative logo. On
image-capable terminals (iTerm2 / WezTerm) it prints the actual logo PNG inline; everywhere else it
shows a clean ANSI wordmark with the tagline + version. Shown on `mindees help` and after
`mindees create`. Output stays plain + parseable when piped or under `NO_COLOR` (no banner on
non-TTY stdout).
