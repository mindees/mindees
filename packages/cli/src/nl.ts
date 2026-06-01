/**
 * Natural-language → template mapping for `mindees create --prompt "…"`.
 *
 * This is an **honest, deterministic, offline** keyword mapper — NOT AI codegen.
 * Real natural-language app generation is a Phase 10 (`@mindees/ai` / Synapse)
 * capability; until then, `--prompt` never blocks `create` and never pretends to
 * understand more than it does: it picks the closest built-in template by
 * keyword and explains why. The deterministic fallback is the `blank` template.
 *
 * @module
 */

import { DEFAULT_TEMPLATE, getTemplate } from './templates'

/** The chosen template plus a short reason (shown to the user). */
export interface TemplatePick {
  template: string
  reason: string
}

/** Keyword → template rules, checked in order. */
const RULES: Array<{ keywords: string[]; template: string }> = [
  {
    keywords: ['counter', 'count', 'increment', 'button', 'click', 'reactive'],
    template: 'counter',
  },
]

/**
 * Map a free-text prompt to a built-in template by keyword. Deterministic and
 * offline; defaults to {@link DEFAULT_TEMPLATE} when nothing matches. If a rule
 * points at a template that doesn't exist, it's skipped (defensive).
 */
export function naturalLanguageToTemplate(prompt: string): TemplatePick {
  const text = prompt.toLowerCase()
  for (const rule of RULES) {
    if (!getTemplate(rule.template)) continue
    const hit = rule.keywords.find((k) => text.includes(k))
    if (hit) {
      return { template: rule.template, reason: `matched keyword "${hit}"` }
    }
  }
  return { template: DEFAULT_TEMPLATE, reason: 'no keyword matched; using the default template' }
}
