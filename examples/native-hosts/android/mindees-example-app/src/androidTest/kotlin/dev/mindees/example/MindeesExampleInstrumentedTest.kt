package dev.mindees.example

import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * On-device proof that a **real multi-screen MindeesNative app** — @mindees/core signals,
 * @mindees/atlas primitives, the @mindees/router (Quantum) router, and the
 * @mindees/renderer (Helix) reconciler, running in QuickJS from the bundled asset —
 * renders into native Android views, reacts to input, and navigates between routes.
 *
 * It exercises the whole stack composing: a signal mutation (fine-grained reactive
 * update), programmatic router navigation (native subtree swap), and state survival
 * across navigation (a module-scoped signal).
 */
@RunWith(AndroidJUnit4::class)
class MindeesExampleInstrumentedTest {
    @Test
    fun rendersNavigatesAndReactsThroughEmbeddedRuntime() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val content = activity.findViewById<ViewGroup>(android.R.id.content)

                // --- Home route mounted (real Atlas tree) ---
                requireView(content, TextView::class.java) { it.text.toString() == "MindeesNative" }
                val doneLabel = requireView(content, TextView::class.java) {
                    it.text.toString() == "Done today: 0"
                }

                // Device hooks (useWindowDimensions/useColorScheme) read real values the
                // host injected: a non-zero screen width proves the environment reached JS.
                requireView(content, TextView::class.java) {
                    Regex("""^Screen [1-9]\d*×\d+ · (light|dark)$""").matches(it.text.toString())
                }

                // Fine-grained reactivity: a press patches only the counter text node.
                tap(content, "Mark done")
                assertEquals("Done today: 1", doneLabel.text.toString())

                // --- Navigate Home -> About (router swaps the native subtree) ---
                tap(content, "About →")
                requireView(content, TextView::class.java) { it.text.toString() == "About" }
                requireView(content, TextView::class.java) {
                    it.text.toString().startsWith("File-based routes")
                }
                // Home's content is gone (the old route subtree was removed + disposed).
                assertNull(
                    findView(content, TextView::class.java) { it.text.toString() == "Mark done" },
                )

                // --- Navigate About -> Home; module-scoped signal state survived ---
                tap(content, "← Home")
                requireView(content, TextView::class.java) { it.text.toString() == "MindeesNative" }
                requireView(content, TextView::class.java) { it.text.toString() == "Done today: 1" }
            }
        }
    }

    /** Find the label, click its clickable ancestor (Atlas Button = Pressable view > Text). */
    private fun tap(root: View, label: String) {
        val text = requireView(root, TextView::class.java) { it.text.toString() == label }
        val button = clickableAncestor(text)
            ?: throw AssertionError("'$label' has no clickable ancestor view")
        assertTrue("native click on '$label' should be handled", button.performClick())
    }

    private fun clickableAncestor(view: View): View? {
        var current: View? = view
        while (current != null) {
            if (current.isClickable) return current
            current = current.parent as? View
        }
        return null
    }

    private fun <T : View> requireView(root: View, type: Class<T>, matches: (T) -> Boolean): T =
        findView(root, type, matches) ?: throw AssertionError("Expected ${type.simpleName} not found")

    private fun <T : View> findView(root: View, type: Class<T>, matches: (T) -> Boolean): T? {
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
