/*
 * AndroidViewRenderer.kt — a HostRenderer that builds real android.view widgets from
 * the MindeesNative command stream, mapping Atlas's curated cross-platform `StyleObject`
 * onto native layout + visuals.
 *
 * Layout uses LinearLayout (built-in, no extra dependency): Atlas's flex subset —
 * flexDirection, justifyContent/alignItems (→ gravity), gap (→ child margins),
 * flex/flexGrow (→ weight) — plus the box model, background/radius/border, opacity,
 * and text styling. It is deliberately a faithful-but-pragmatic subset (no wrap /
 * space-* distribution); a FlexboxLayout backend can replace it behind this same
 * interface later.
 *
 * Device-facing, but JVM-testable via Robolectric (AndroidRenderTest) and on-device
 * by the native Android workflow. See the module README.
 */

package dev.mindees.host

import android.content.Context
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
import android.widget.LinearLayout
import android.widget.TextView

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
        // 'view' / 'scrollview' / unknown → a flex container. (Real scrolling can wrap
        // this in a ScrollView later; the common case is a plain column/row.)
        else -> LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
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
            applyLayoutParams(child) // carry the child's width/height/grow into LinearLayout params
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
        val container = view as? LinearLayout
        val text = view as? TextView // Button/EditText are TextView subclasses
        val lay = layoutOf(view)

        // Flex container axis + content alignment.
        (style["flexDirection"] as? NativeProp.Str)?.value?.let { dir ->
            lay.horizontal = dir.startsWith("row")
            container?.orientation =
                if (lay.horizontal) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL
        }
        (dimen(style["gap"]) ?: dimen(style["rowGap"]) ?: dimen(style["columnGap"]))?.let {
            lay.gapPx = it
            reapplyGaps(container)
        }
        if (container != null && (style.containsKey("justifyContent") || style.containsKey("alignItems"))) {
            container.gravity =
                gravityFor(lay.horizontal, strOf(style["justifyContent"]), strOf(style["alignItems"]))
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
        val lp = (view.layoutParams as? LinearLayout.LayoutParams)
            ?: LinearLayout.LayoutParams(lay.widthSpec, lay.heightSpec)
        lp.width = lay.widthSpec
        lp.height = lay.heightSpec
        lp.weight = lay.grow
        view.layoutParams = lp
    }

    /** Recreate gaps as leading margins on every child (all but the first along the axis). */
    private fun reapplyGaps(parent: View?) {
        val container = parent as? LinearLayout ?: return
        val lay = layouts[container] ?: return
        for (i in 0 until container.childCount) {
            val child = container.getChildAt(i)
            val lp = child.layoutParams as? LinearLayout.LayoutParams ?: continue
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
    private fun gravityFor(horizontal: Boolean, justify: String?, align: String?): Int {
        val main = when (justify) {
            "flex-end" -> if (horizontal) Gravity.END else Gravity.BOTTOM
            "center", "space-between", "space-around", "space-evenly" ->
                if (horizontal) Gravity.CENTER_HORIZONTAL else Gravity.CENTER_VERTICAL
            else -> if (horizontal) Gravity.START else Gravity.TOP
        }
        val cross = when (align) {
            "flex-end" -> if (horizontal) Gravity.BOTTOM else Gravity.END
            "center" -> if (horizontal) Gravity.CENTER_VERTICAL else Gravity.CENTER_HORIZONTAL
            "flex-start" -> if (horizontal) Gravity.TOP else Gravity.START
            else -> 0 // stretch / baseline / auto → LinearLayout default
        }
        return main or cross
    }
}
