/**
 * The `mindees` CLI banner — shows the MindeesNative logo in a friendly way. On image-capable
 * terminals (iTerm2 / WezTerm / VS Code) it prints the actual logo PNG inline; everywhere else it
 * prints an ANSI wordmark. Pure functions only — the real terminal detection + file read live in
 * `bin.ts` and inject the result, so this stays testable.
 *
 * @module
 */

/** Inputs for {@link renderBanner}. */
export interface BannerOptions {
  /** Emit ANSI color. `false` for piped output / `NO_COLOR`. */
  readonly color?: boolean
  /** A pre-built terminal inline-image escape (see {@link itermImage}); printed above the wordmark. */
  readonly image?: string | null
  /** Version string, shown next to the wordmark. */
  readonly version?: string
}

const RESET = '\x1b[0m'
const BRAND = '\x1b[38;2;99;102;241m' // indigo — the flat-vector logo's accent
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'

const paint = (on: boolean, code: string, text: string): string =>
  on ? `${code}${text}${RESET}` : text

/** The ANSI wordmark (always portable — works in every terminal, CI, and piped output). */
export function wordmark(opts: BannerOptions = {}): string {
  const on = opts.color !== false
  const ver = opts.version ? paint(on, DIM, `v${opts.version}`) : ''
  const title = `${paint(on, BRAND + BOLD, '◆ MindeesNative')}${ver ? `  ${ver}` : ''}`
  return [
    title,
    paint(on, DIM, 'The cross-platform framework built to make React Native & Flutter obsolete.'),
    paint(on, DIM, 'One language · native performance · native look · instant updates'),
  ].join('\n')
}

/** The full banner: the inline logo image (if provided) above the {@link wordmark}. */
export function renderBanner(opts: BannerOptions = {}): string {
  const wm = wordmark(opts)
  return opts.image ? `${opts.image}\n${wm}` : wm
}

/**
 * Build an iTerm2 / WezTerm inline-image escape (OSC 1337) for a base64-encoded PNG. The image is
 * sized in terminal cells so the logo stays small.
 */
export function itermImage(base64: string, opts: { width?: number; height?: number } = {}): string {
  const args = ['inline=1', 'preserveAspectRatio=1']
  if (opts.width) args.push(`width=${opts.width}`)
  if (opts.height) args.push(`height=${opts.height}`)
  return `\x1b]1337;File=${args.join(';')}:${base64}\x07`
}

/** Detect terminal inline-image (iTerm2-protocol) support from environment variables. */
export function detectImageSupport(env: Record<string, string | undefined>): 'iterm' | null {
  if (env.LC_TERMINAL === 'iTerm2') return 'iterm'
  const program = env.TERM_PROGRAM ?? ''
  if (/iTerm|WezTerm|vscode/i.test(program)) return 'iterm'
  return null
}
