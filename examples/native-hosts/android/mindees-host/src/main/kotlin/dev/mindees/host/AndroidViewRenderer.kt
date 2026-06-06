/*
 * AndroidViewRenderer.kt — a HostRenderer that builds real android.view widgets from
 * the MindeesNative command stream, mapping Atlas's curated cross-platform `StyleObject`
 * onto native layout + visuals.
 *
 * Layout uses Google FlexboxLayout for full flex parity: flexDirection,
 * justifyContent (incl. space-between/around/evenly), alignItems, flexWrap, alignSelf,
 * gap (→ child margins), flex/flexGrow (→ FlexboxLayout.LayoutParams.flexGrow) — plus
 * the box model, background/radius/border, opacity, and text styling.
 *
 * Device-facing, but JVM-testable via Robolectric (AndroidRenderTest) and on-device
 * by the native Android workflow. See the module README.
 */

package dev.mindees.host

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import com.google.android.flexbox.AlignItems
import com.google.android.flexbox.AlignSelf
import com.google.android.flexbox.FlexDirection
import com.google.android.flexbox.FlexWrap
import com.google.android.flexbox.FlexboxLayout
import com.google.android.flexbox.JustifyContent

/** Builds Android views from the command stream. Pair with [MindeesNativeHost]. */
class AndroidViewRenderer(private val context: Context) : HostRenderer<View> {

    private val density: Float = context.resources.displayMetrics.density

    /** dp → px (Atlas numeric style values are density-independent pixels on native). */
    private fun dp(value: Double): Int = Math.round(value * density).toInt()

    /**
     * Layout intent we must (re)apply via LayoutParams when a child is inserted, or
     * when a container's gap/direction changes. Kept off the View so the mapping stays
     * explicit and testable.
     */
    private class Layout {
        var horizontal = false
        var gapPx = 0
        var widthSpec = ViewGroup.LayoutParams.WRAP_CONTENT
        var heightSpec = ViewGroup.LayoutParams.WRAP_CONTENT
        var grow = 0f
        var alignSelf = AlignSelf.AUTO
    }

    private val layouts = HashMap<View, Layout>()
    private fun layoutOf(view: View): Layout = layouts.getOrPut(view) { Layout() }

    /**
     * Text composition. A leaf widget (TextView/Button/EditText) can't hold child views,
     * but the element model nests text *nodes* inside a `text` *element* (e.g. Atlas's
     * `Text` → `<text>"hello"</text>`). So we compose a text element's text-node children
     * into its own `text` instead of attaching them as views. `textParts` keeps each
     * element's ordered text-node children; `textOwner` is the reverse lookup so an
     * `updateText` on a child re-composes its owner.
     */
    private val textParts = HashMap<View, MutableList<View>>()
    private val textOwner = HashMap<View, View>()

    private fun recomposeText(element: View) {
        val tv = element as? TextView ?: return
        val parts = textParts[element] ?: return
        tv.text = parts.joinToString("") { (it as? TextView)?.text ?: "" }
    }

    // --- Node creation ---

    override fun makeElement(tag: String): View = when (tag) {
        "text" -> TextView(context)
        "image" -> ImageView(context)
        "textinput" -> EditText(context)
        "button" -> Button(context) // direct use; Atlas Button renders as a clickable 'view'
        // Atlas ActivityIndicator → a native indeterminate spinner.
        "activityindicator" -> ProgressBar(context).apply {
            isIndeterminate = true
            layoutOf(this)
        }
        // 'view' / 'scrollview' / unknown → a real flex container (FlexboxLayout): full
        // flexDirection / justifyContent (incl. space-*) / alignItems / flexWrap / alignSelf.
        else -> FlexboxLayout(context).apply {
            flexDirection = FlexDirection.COLUMN
            layoutOf(this)
        }
    }

    override fun makeText(text: String): View = TextView(context).apply { this.text = text }

    override fun setText(view: View, text: String) {
        (view as? TextView)?.text = text
        // If this text node is composed into a parent text element, re-compose the parent.
        textOwner[view]?.let { recomposeText(it) }
    }

    // --- Props ---

    override fun setProp(view: View, name: String, value: NativeProp) {
        when (name) {
            "style" -> (value as? NativeProp.Obj)?.let { applyStyle(view, it.value) }
            "accessibilityLabel", "aria-label", "label" -> view.contentDescription = strOf(value)
            "title", "text" -> (view as? TextView)?.text = strOf(value)
            "placeholder" -> (view as? EditText)?.hint = strOf(value)
            "value" -> (view as? EditText)?.let { if (it.text.toString() != strOf(value)) it.setText(strOf(value)) }
            "hidden" -> view.visibility = if (boolOf(value)) View.GONE else View.VISIBLE
            // a11y/meta hints the DOM backend also emits — no-ops on this host.
            else -> Unit
        }
    }

    override fun removeProp(view: View, name: String) {
        when (name) {
            "accessibilityLabel", "aria-label", "label" -> view.contentDescription = null
            "hidden" -> view.visibility = View.VISIBLE
            else -> Unit
        }
    }

    // --- Tree structure ---

    override fun insert(parent: View, child: View, index: Int) {
        if (parent is ViewGroup) {
            applyLayoutParams(child) // carry the child width/height/grow/alignSelf into FlexboxLayout params
            parent.addView(child, index.coerceIn(0, parent.childCount))
            reapplyGaps(parent)
            return
        }
        // Leaf (e.g. a `text` element): compose text-node children into its text.
        val parts = textParts.getOrPut(parent) { mutableListOf() }
        parts.add(index.coerceIn(0, parts.size), child)
        textOwner[child] = parent
        recomposeText(parent)
    }

    override fun remove(parent: View, child: View) {
        if (parent is ViewGroup) {
            parent.removeView(child)
            reapplyGaps(parent)
            return
        }
        textOwner.remove(child)
        textParts[parent]?.remove(child)
        recomposeText(parent)
    }

    override fun dispose(view: View) {
        (view.parent as? ViewGroup)?.removeView(view)
        layouts.remove(view)
        // Detach from any text composition it participated in (as child or as owner).
        textOwner.remove(view)?.let { owner ->
            textParts[owner]?.remove(view)
            recomposeText(owner)
        }
        textParts.remove(view)
    }

    // --- Events ---

    override fun addEvent(view: View, eventName: String, handlerId: String, fire: () -> Unit) {
        // Atlas's Pressable emits `onClick` → `click`; the older hand-written demo used
        // `press`. Accept both; ignore pointer/keyboard/focus events this host doesn't model.
        when (eventName) {
            "click", "press" -> {
                view.isClickable = true
                view.setOnClickListener { fire() }
            }
            else -> Unit
        }
    }

    override fun removeEvent(view: View, eventName: String, handlerId: String) {
        if (eventName == "click" || eventName == "press") view.setOnClickListener(null)
    }

    // --- Style application ---

    private fun applyStyle(view: View, style: Map<String, NativeProp>) {
        val container = view as? FlexboxLayout
        val text = view as? TextView // Button/EditText are TextView subclasses
        val lay = layoutOf(view)

        // Flex container: direction, justify (incl. space-*), align, wrap.
        (style["flexDirection"] as? NativeProp.Str)?.value?.let { dir ->
            lay.horizontal = dir.startsWith("row")
            container?.flexDirection = flexDirectionFor(dir)
        }
        (dimen(style["gap"]) ?: dimen(style["rowGap"]) ?: dimen(style["columnGap"]))?.let {
            lay.gapPx = it
            reapplyGaps(container)
        }
        strOf(style["justifyContent"])?.let { container?.justifyContent = justifyContentFor(it) }
        strOf(style["alignItems"])?.let { container?.alignItems = alignItemsFor(it) }
        strOf(style["flexWrap"])?.let { container?.flexWrap = flexWrapFor(it) }
        // Per-child cross-axis override (applied via the child's FlexboxLayout.LayoutParams on insert).
        strOf(style["alignSelf"])?.let {
            lay.alignSelf = alignSelfFor(it)
            applyLayoutParams(view)
        }
        (numOf(style["flexGrow"]) ?: numOf(style["flex"]))?.let {
            lay.grow = it.toFloat()
            applyLayoutParams(view)
        }

        // Box model.
        sizeOf(style["width"])?.let { lay.widthSpec = it; applyLayoutParams(view) }
        sizeOf(style["height"])?.let { lay.heightSpec = it; applyLayoutParams(view) }
        dimen(style["minWidth"])?.let { view.minimumWidth = it }
        dimen(style["minHeight"])?.let { view.minimumHeight = it }
        applyPadding(view, style)

        // Visual.
        applyBackground(view, style)
        numOf(style["opacity"])?.let { view.alpha = it.toFloat() }

        // Text.
        if (text != null) applyText(text, style)

        // Spinner tint (ActivityIndicator → ProgressBar): `color` drives the indeterminate arc.
        (view as? ProgressBar)?.let { bar ->
            color(style["color"])?.let { bar.indeterminateTintList = ColorStateList.valueOf(it) }
        }
    }

    private fun applyPadding(view: View, style: Map<String, NativeProp>) {
        if (style.keys.none { it == "padding" || it.startsWith("padding") }) return
        val all = dimen(style["padding"])
        val l = dimen(style["paddingLeft"]) ?: all ?: view.paddingLeft
        val t = dimen(style["paddingTop"]) ?: all ?: view.paddingTop
        val r = dimen(style["paddingRight"]) ?: all ?: view.paddingRight
        val b = dimen(style["paddingBottom"]) ?: all ?: view.paddingBottom
        view.setPadding(l, t, r, b)
    }

    private fun applyBackground(view: View, style: Map<String, NativeProp>) {
        val bg = color(style["backgroundColor"])
        val radius = dimen(style["borderRadius"])
        val borderW = dimen(style["borderWidth"])
        val borderC = color(style["borderColor"])
        if (bg == null && radius == null && borderW == null && borderC == null) return
        val drawable = (view.background as? GradientDrawable) ?: GradientDrawable()
        bg?.let { drawable.setColor(it) }
        radius?.let { drawable.cornerRadius = it.toFloat() }
        if (borderW != null || borderC != null) {
            drawable.setStroke(borderW ?: 0, borderC ?: Color.TRANSPARENT)
        }
        view.background = drawable
    }

    private fun applyText(text: TextView, style: Map<String, NativeProp>) {
        color(style["color"])?.let { text.setTextColor(it) }
        numOf(style["fontSize"])?.let { text.setTextSize(TypedValue.COMPLEX_UNIT_DIP, it.toFloat()) }
        fontWeightBold(style["fontWeight"])?.let { bold ->
            // Two-arg setTypeface: uses a real bold face when available, else falls back to
            // synthetic (fake) bold — so weight always takes visible effect.
            text.setTypeface(text.typeface, if (bold) Typeface.BOLD else Typeface.NORMAL)
        }
        (style["textAlign"] as? NativeProp.Str)?.value?.let { text.gravity = textGravity(it) }
    }

    // --- LayoutParams + gaps ---

    private fun applyLayoutParams(view: View) {
        val lay = layoutOf(view)
        val lp = (view.layoutParams as? FlexboxLayout.LayoutParams)
            ?: FlexboxLayout.LayoutParams(lay.widthSpec, lay.heightSpec)
        lp.width = lay.widthSpec
        lp.height = lay.heightSpec
        lp.flexGrow = lay.grow
        lp.alignSelf = lay.alignSelf
        view.layoutParams = lp
    }

    /** Recreate gaps as leading margins on every child (all but the first along the main axis). */
    private fun reapplyGaps(parent: View?) {
        val container = parent as? FlexboxLayout ?: return
        val lay = layouts[container] ?: return
        for (i in 0 until container.childCount) {
            val child = container.getChildAt(i)
            val lp = child.layoutParams as? FlexboxLayout.LayoutParams ?: continue
            val lead = if (i == 0) 0 else lay.gapPx
            if (lay.horizontal) {
                lp.leftMargin = lead
                lp.topMargin = 0
            } else {
                lp.topMargin = lead
                lp.leftMargin = 0
            }
            child.layoutParams = lp
        }
    }

    // --- Flex enum mappings (Atlas/CSS strings → FlexboxLayout constants) ---

    private fun flexDirectionFor(dir: String): Int = when (dir) {
        "row" -> FlexDirection.ROW
        "row-reverse" -> FlexDirection.ROW_REVERSE
        "column-reverse" -> FlexDirection.COLUMN_REVERSE
        else -> FlexDirection.COLUMN
    }

    private fun justifyContentFor(justify: String): Int = when (justify) {
        "flex-end", "end" -> JustifyContent.FLEX_END
        "center" -> JustifyContent.CENTER
        "space-between" -> JustifyContent.SPACE_BETWEEN
        "space-around" -> JustifyContent.SPACE_AROUND
        "space-evenly" -> JustifyContent.SPACE_EVENLY
        else -> JustifyContent.FLEX_START
    }

    private fun alignItemsFor(align: String): Int = when (align) {
        "flex-end", "end" -> AlignItems.FLEX_END
        "center" -> AlignItems.CENTER
        "baseline" -> AlignItems.BASELINE
        "flex-start", "start" -> AlignItems.FLEX_START
        else -> AlignItems.STRETCH
    }

    private fun flexWrapFor(wrap: String): Int = when (wrap) {
        "wrap" -> FlexWrap.WRAP
        "wrap-reverse" -> FlexWrap.WRAP_REVERSE
        else -> FlexWrap.NOWRAP
    }

    private fun alignSelfFor(align: String): Int = when (align) {
        "flex-end", "end" -> AlignSelf.FLEX_END
        "center" -> AlignSelf.CENTER
        "baseline" -> AlignSelf.BASELINE
        "stretch" -> AlignSelf.STRETCH
        "flex-start", "start" -> AlignSelf.FLEX_START
        else -> AlignSelf.AUTO
    }

    // --- Value coercion (defensive: unknown/ill-typed values are ignored, never crash) ---

    private fun numOf(prop: NativeProp?): Double? = (prop as? NativeProp.Num)?.value
    private fun strOf(prop: NativeProp?): String? = (prop as? NativeProp.Str)?.value
    private fun boolOf(prop: NativeProp?): Boolean = (prop as? NativeProp.Bool)?.value == true

    /** A numeric dp dimension, or null for strings/absent (percent sizes go via [sizeOf]). */
    private fun dimen(prop: NativeProp?): Int? = (prop as? NativeProp.Num)?.let { dp(it.value) }

    /** A width/height spec: number → dp, `"100%"` → MATCH_PARENT, `"auto"` → WRAP_CONTENT. */
    private fun sizeOf(prop: NativeProp?): Int? = when (prop) {
        is NativeProp.Num -> dp(prop.value)
        is NativeProp.Str -> when (prop.value) {
            "100%" -> ViewGroup.LayoutParams.MATCH_PARENT
            "auto" -> ViewGroup.LayoutParams.WRAP_CONTENT
            else -> null
        }
        else -> null
    }

    private fun color(prop: NativeProp?): Int? {
        val raw = (prop as? NativeProp.Str)?.value ?: return null
        return try {
            Color.parseColor(raw)
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    /** true → bold, false → normal, null → leave unchanged. `>= 600` (or `"bold"`) is bold. */
    private fun fontWeightBold(prop: NativeProp?): Boolean? = when (prop) {
        is NativeProp.Num -> prop.value >= 600
        is NativeProp.Str -> prop.value == "bold" || (prop.value.toIntOrNull() ?: 0) >= 600
        else -> null
    }

    private fun textGravity(align: String): Int = when (align) {
        "center" -> Gravity.CENTER
        "right" -> Gravity.END
        "justify" -> Gravity.START // no native justify on older APIs; left-align
        else -> Gravity.START
    }

    /** main axis ← justifyContent, cross axis ← alignItems. `space-*` falls back to center. */
}
