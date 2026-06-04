package dev.mindees.example

import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MindeesExampleInstrumentedTest {
    @Test
    fun rendersCounterAndHandlesPressThroughEmbeddedRuntime() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val content = activity.findViewById<ViewGroup>(android.R.id.content)
                val label = requireView(content, TextView::class.java) {
                    it.text.toString() == "Count: 0"
                }
                val button = requireView(content, Button::class.java) {
                    it.text.toString() == "Increment"
                }

                assertTrue("native button should handle the click", button.performClick())
                assertEquals("Count: 1", label.text.toString())
            }
        }
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
