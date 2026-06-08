---
"@mindees/atlas": patch
---

Harden the a11y + tab features after an adversarial review (3 defects):

- **Modal focus trap (high):** the trap's focusable query had no visibility filter, so a `display:none`
  focusable — e.g. a tab navigator's inactive, kept-alive panel inside a `Modal` — became a false Tab
  boundary and let focus escape the dialog. The trap now skips hidden focusables (inline
  `display:none`/`hidden`/`aria-hidden` up to the scope, plus no-box elements in real browsers).
- **`announce` (medium):** two calls in the same frame dropped the first (shared region, last-write-wins).
  Same-frame messages are now queued and announced together (none lost).
- **`createTabNavigator` (medium):** a URL matching no tab falsely selected/showed tab 0. It now selects
  and shows nothing (no `aria-selected`, no visible panel) when the URL belongs to no tab.
