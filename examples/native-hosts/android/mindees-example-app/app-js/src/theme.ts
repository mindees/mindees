/** Shared palette + styles for the example's screens. */

export const palette = {
  screenBg: '#0b1021',
  cardBg: '#171c33',
  accent: '#5b8cff',
  accentText: '#ffffff',
  slateBg: '#2a3050',
  heading: '#e8ecff',
  muted: '#9aa4d2',
  body: '#c3cbf0',
}

export const screenStyle = {
  flexGrow: 1,
  width: '100%',
  padding: 24,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: palette.screenBg,
} as const

export const cardStyle = {
  backgroundColor: palette.cardBg,
  padding: 28,
  gap: 14,
  borderRadius: 20,
  alignItems: 'center',
  minWidth: 280,
} as const

export const headingStyle = { fontSize: 24, fontWeight: 800, color: palette.heading } as const

const buttonBase = {
  color: palette.accentText,
  paddingTop: 12,
  paddingBottom: 12,
  paddingLeft: 20,
  paddingRight: 20,
  borderRadius: 12,
  fontWeight: 600,
} as const
export const accentButton = { ...buttonBase, backgroundColor: palette.accent } as const
export const slateButton = { ...buttonBase, backgroundColor: palette.slateBg } as const
