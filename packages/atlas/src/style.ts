/**
 * Atlas styling — a curated, typed `StyleObject` that is the single cross-platform style
 * vehicle. The renderer applies one `style` object to web inline styles (numbers → `px` for
 * dimensional props) and serializes the same object as a native prop, so Atlas never needs a
 * second channel. The subset is hand-picked to be meaningful on **both** web and native;
 * anything outside it goes through the explicit `unsafeStyle` escape hatch. See
 * `docs/adr/0022-atlas-primitives.md`.
 *
 * @module
 */

/** A single style value: a string (e.g. `'red'`, `'50%'`) or a number (px on web, dp on native). */
export type StyleValue = string | number

/** A curated, cross-platform-meaningful style object. */
export interface StyleObject {
  // Flexbox layout
  display?: 'flex' | 'none'
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse'
  justifyContent?:
    | 'flex-start'
    | 'flex-end'
    | 'center'
    | 'space-between'
    | 'space-around'
    | 'space-evenly'
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline'
  alignSelf?: 'auto' | 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline'
  flexWrap?: 'wrap' | 'nowrap' | 'wrap-reverse'
  flex?: number | string
  flexGrow?: number
  flexShrink?: number
  flexBasis?: StyleValue
  gap?: StyleValue
  rowGap?: StyleValue
  columnGap?: StyleValue

  // Box model
  width?: StyleValue
  height?: StyleValue
  minWidth?: StyleValue
  minHeight?: StyleValue
  maxWidth?: StyleValue
  maxHeight?: StyleValue
  padding?: StyleValue
  paddingTop?: StyleValue
  paddingRight?: StyleValue
  paddingBottom?: StyleValue
  paddingLeft?: StyleValue
  margin?: StyleValue
  marginTop?: StyleValue
  marginRight?: StyleValue
  marginBottom?: StyleValue
  marginLeft?: StyleValue
  position?: 'relative' | 'absolute' | 'fixed' | 'sticky' | 'static'
  top?: StyleValue
  right?: StyleValue
  bottom?: StyleValue
  left?: StyleValue
  overflow?: 'visible' | 'hidden' | 'scroll' | 'auto'
  zIndex?: number

  // Visual
  backgroundColor?: string
  opacity?: number
  borderRadius?: StyleValue
  borderWidth?: StyleValue
  borderColor?: string
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none'
  boxShadow?: string

  // Text
  color?: string
  fontSize?: StyleValue
  fontWeight?: number | string
  fontFamily?: string
  lineHeight?: StyleValue
  letterSpacing?: StyleValue
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  textDecoration?: string

  // Transform / interaction (web-leaning but harmless on native)
  transform?: string
  cursor?: string
}

/** A style or a (possibly nested) list of styles with falsy entries dropped — `flattenStyle` merges it. */
export type StyleInput = StyleObject | false | null | undefined | StyleInput[]

/**
 * Merge a {@link StyleInput} (a style, or an array of styles with `false`/`null`/`undefined`
 * entries skipped) into one {@link StyleObject}; later entries win. Lets conditional styles
 * compose: `flattenStyle([base, active && activeStyle, props.style])`.
 */
export function flattenStyle(input: StyleInput): StyleObject {
  const out: StyleObject = {}
  const visit = (value: StyleInput): void => {
    if (!value) return
    if (Array.isArray(value)) {
      for (const v of value) visit(v)
      return
    }
    Object.assign(out, value)
  }
  visit(input)
  return out
}
