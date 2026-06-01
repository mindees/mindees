import { describe, expect, it } from 'vitest'
import { naturalLanguageToTemplate } from './nl'

describe('naturalLanguageToTemplate', () => {
  it('maps counter-ish prompts to the counter template', () => {
    expect(naturalLanguageToTemplate('a counter app').template).toBe('counter')
    expect(naturalLanguageToTemplate('something with an increment button').template).toBe('counter')
    expect(naturalLanguageToTemplate('make it reactive').template).toBe('counter')
  })

  it('defaults to blank when nothing matches', () => {
    const pick = naturalLanguageToTemplate('a todo list with offline sync')
    expect(pick.template).toBe('blank')
    expect(pick.reason).toMatch(/no keyword matched/)
  })

  it('is case-insensitive', () => {
    expect(naturalLanguageToTemplate('A COUNTER').template).toBe('counter')
  })

  it('always returns a reason', () => {
    expect(naturalLanguageToTemplate('counter').reason).toMatch(/matched keyword/)
  })
})
