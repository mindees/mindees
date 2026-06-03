/*
 * AndroidRenderTest.kt — on-device(-runtime) rendering proof via Robolectric.
 *
 * Unlike MindeesNativeHostTest (which uses the in-memory ModelRenderer), this
 * exercises the REAL AndroidViewRenderer against actual android.view widgets,
 * running on Robolectric's faithful JVM Android runtime (no emulator/device). It
 * decodes the JSON wire format the JS backend emits and asserts the resulting
 * View hierarchy — proving the command stream renders into correct native views.
 *
 * ⚠️ Authored; verified by the Android CI job (`./gradlew :mindees-host:test`).
 */

package dev.mindees.host

import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34]) // pin a Robolectric-supported SDK, independent of compileSdk
class AndroidRenderTest {
    private fun newHost(): Pair<MindeesNativeHost<View>, LinearLayout> {
        val context = RuntimeEnvironment.getApplication()
        val container = LinearLayout(context)
        val host = MindeesNativeHost<View>("host-root", container, AndroidViewRenderer(context)) {}
        return host to container
    }

    @Test
    fun rendersCommandStreamIntoAndroidViews() {
        val (host, container) = newHost()
        host.apply(
            NativeCommandCodec.decodeBatch(
                """
                [
                  {"type":"createNode","id":"v","tag":"view"},
                  {"type":"createText","id":"t","text":"Hello"},
                  {"type":"insertChild","parentId":"v","childId":"t","index":0},
                  {"type":"createNode","id":"b","tag":"button"},
                  {"type":"insertChild","parentId":"v","childId":"b","index":1},
                  {"type":"insertChild","parentId":"host-root","childId":"v","index":0}
                ]
                """.trimIndent(),
            ),
        )

        // Real android.view hierarchy: container > view > [TextView("Hello"), Button].
        assertEquals(1, container.childCount)
        val view = container.getChildAt(0) as ViewGroup
        assertEquals(2, view.childCount)
        assertEquals("Hello", (view.getChildAt(0) as TextView).text.toString())
        assertTrue(view.getChildAt(1) is Button)

        // updateText patches the live TextView.
        host.apply(NativeCommandCodec.decodeBatch("""[{"type":"updateText","id":"t","text":"Bye"}]"""))
        assertEquals("Bye", (view.getChildAt(0) as TextView).text.toString())

        // Removing + disposing the label detaches it from the real view tree.
        host.apply(
            NativeCommandCodec.decodeBatch(
                """
                [
                  {"type":"removeChild","parentId":"v","childId":"t"},
                  {"type":"disposeNode","id":"t"}
                ]
                """.trimIndent(),
            ),
        )
        assertEquals(1, view.childCount)
        assertTrue(view.getChildAt(0) is Button)
    }

    @Test
    fun wiresClickHandlerThatDispatches() {
        val fired = mutableListOf<String>()
        val context = RuntimeEnvironment.getApplication()
        val container = LinearLayout(context)
        val host = MindeesNativeHost<View>("host-root", container, AndroidViewRenderer(context)) {
            fired.add(it)
        }
        host.apply(
            NativeCommandCodec.decodeBatch(
                """
                [
                  {"type":"createNode","id":"b","tag":"button"},
                  {"type":"registerEvent","id":"b","eventName":"press","handlerId":"h1"},
                  {"type":"insertChild","parentId":"host-root","childId":"b","index":0}
                ]
                """.trimIndent(),
            ),
        )
        // performClick() drives the real OnClickListener the renderer wired.
        container.getChildAt(0).performClick()
        assertEquals(listOf("h1"), fired)
    }
}
