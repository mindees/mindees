/*
 * AndroidViewRenderer.kt — a HostRenderer that builds real android.view widgets.
 *
 * The device-facing layer (needs a device/emulator to actually render). Tag mapping
 * and prop application are an intentional MVP — extend for your design system.
 *
 * ⚠️ Authored, not yet compiled/run by the maintainers — see the module README.
 */

package dev.mindees.host

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/** Builds Android views from the command stream. Pair with [MindeesNativeHost]. */
class AndroidViewRenderer(private val context: Context) : HostRenderer<View> {

    override fun makeElement(tag: String): View = when (tag) {
        "text" -> TextView(context)
        "button" -> Button(context)
        // MVP placeholder container; swap for android.widget.ScrollView (which takes a
        // single child) when you need real scrolling.
        "scrollview" -> FrameLayout(context)
        else -> LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
    }

    override fun makeText(text: String): View = TextView(context).apply { this.text = text }

    override fun setText(view: View, text: String) {
        (view as? TextView)?.text = text
    }

    override fun setProp(view: View, name: String, value: NativeProp) {
        // Minimal reference mapping — extend for a real design system.
        when (name) {
            "accessibilityLabel" -> view.contentDescription = (value as? NativeProp.Str)?.value
            "title" -> (value as? NativeProp.Str)?.let { (view as? TextView)?.text = it.value }
            "hidden" -> view.visibility =
                if ((value as? NativeProp.Bool)?.value == true) View.GONE else View.VISIBLE
            else -> Unit // unmapped props ignored in this MVP
        }
    }

    override fun removeProp(view: View, name: String) {
        when (name) {
            "accessibilityLabel" -> view.contentDescription = null
            "hidden" -> view.visibility = View.VISIBLE
            else -> Unit
        }
    }

    override fun insert(parent: View, child: View, index: Int) {
        val group = parent as? ViewGroup ?: return
        group.addView(child, index.coerceIn(0, group.childCount))
    }

    override fun remove(parent: View, child: View) {
        (parent as? ViewGroup)?.removeView(child)
    }

    override fun addEvent(view: View, eventName: String, handlerId: String, fire: () -> Unit) {
        if (eventName == "press") view.setOnClickListener { fire() }
    }

    override fun removeEvent(view: View, eventName: String, handlerId: String) {
        if (eventName == "press") view.setOnClickListener(null)
    }

    override fun dispose(view: View) {
        (view.parent as? ViewGroup)?.removeView(view)
    }
}
