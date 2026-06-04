package dev.mindees.example

import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * On-device proof that the **real** Atlas + Helix stack — @mindees/core signals,
 * @mindees/atlas primitives, and the @mindees/renderer reconciler, running in QuickJS
 * from the bundled asset — renders into native Android views and reacts to input.
 *
 * Unlike a hand-written command script, the UI here is produced by the genuine
 * pipeline: an Atlas `Button` renders as a clickable `view` wrapping a label, and a
 * press mutates a signal whose fine-grained update patches only the counter's text.
 */
@RunWith(AndroidJUnit4::class)
class MindeesExampleInstrumentedTest {
    @Test
    fun rendersAtlasUiAndReactsThroughEmbeddedRuntime() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val content = activity.findViewById<ViewGroup>(android.R.id.content)

                // The heading proves the real Atlas component tree mounted (not a stub).
                requireView(content, TextView::class.java) { it.text.toString() == "MindeesNative" }
                val countLabel = requireView(content, TextView::class.java) {
                    it.text.toString() == "Count: 0"
                }

                // Atlas Button = Pressable(view, onClick) > Text, so the tappable node is the
                // label's clickable ancestor view — not a native Button widget.
                val incrementLabel = requireView(content, TextView::class.java) {
                    it.text.toString() == "Increment"
                }
                val incrementButton = clickableAncestor(incrementLabel)
                    ?: throw AssertionError("'Increment' label has no clickable ancestor view")
                val resetButton = clickableAncestor(
                    requireView(content, TextView::class.java) { it.text.toString() == "Reset" },
                ) ?: throw AssertionError("'Reset' label has no clickable ancestor view")

                // A press drives QuickJS -> signal.set -> reconciler -> updateText, all native.
                assertTrue("native click should be handled", incrementButton.performClick())
                assertEquals("Count: 1", countLabel.text.toString())
                assertTrue(incrementButton.performClick())
                assertEquals("Count: 2", countLabel.text.toString())

                // Reset goes through the same reactive path back to zero.
                assertTrue(resetButton.performClick())
                assertEquals("Count: 0", countLabel.text.toString())
            }
        }
    }

    /** Nearest ancestor (or self) that is clickable — the node the renderer wired onClick onto. */
    private fun clickableAncestor(view: View): View? {
        var current: View? = view
        while (current != null) {
            if (current.isClickable) return current
            current = current.parent as? View
        }
        return null
    }

    private fun <T : View> requireView(
        root: View,
        type: Class<T>,
        matches: (T) -> Boolean,
    ): T =
        findView(root, type, matches)
            ?: throw AssertionError("Expected ${type.simpleName} not found")

    private fun <T : View> findView(
        root: View,
        type: Class<T>,
        matches: (T) -> Boolean,
    ): T? {
        if (type.isInstance(root)) {
            val typed = type.cast(root)
            if (typed != null && matches(typed)) return typed
        }

        if (root is ViewGroup) {
            for (index in 0 until root.childCount) {
                findView(root.getChildAt(index), type, matches)?.let { return it }
            }
        }

        return null
    }
}
