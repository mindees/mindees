import { describe, expect, it } from 'vitest'
import { detectImageSupport, itermImage, renderBanner, wordmark } from './banner'

describe('banner', () => {
  it('renders a colored wordmark with the brand name, tagline, and version', () => {
    const b = wordmark({ color: true, version: '0.5.0' })
    expect(b).toContain('MindeesNative')
    expect(b).toContain('v0.5.0')
    expect(b).toContain('React Native & Flutter')
    expect(b).toContain('\x1b[') // has ANSI color
  })

  it('emits plain text when color is off (piped / NO_COLOR)', () => {
    const b = wordmark({ color: false, version: '0.5.0' })
    expect(b).toContain('MindeesNative')
    expect(b).not.toContain('\x1b[')
  })

  it('prepends the inline image when provided', () => {
    const img = itermImage('AAAA', { width: 16 })
    const b = renderBanner({ color: false, image: img, version: '0.5.0' })
    expect(b.startsWith(img)).toBe(true)
    expect(b).toContain('MindeesNative')
  })

  it('builds a well-formed iTerm2 inline-image escape', () => {
    const esc = itermImage('Zm9v', { width: 20 })
    expect(esc).toBe('\x1b]1337;File=inline=1;preserveAspectRatio=1;width=20:Zm9v\x07')
  })

  it('detects image support from common terminal env vars', () => {
    expect(detectImageSupport({ TERM_PROGRAM: 'iTerm.app' })).toBe('iterm')
    expect(detectImageSupport({ TERM_PROGRAM: 'WezTerm' })).toBe('iterm')
    expect(detectImageSupport({ LC_TERMINAL: 'iTerm2' })).toBe('iterm')
    expect(detectImageSupport({ TERM_PROGRAM: 'Apple_Terminal' })).toBe(null)
    expect(detectImageSupport({})).toBe(null)
  })
})
