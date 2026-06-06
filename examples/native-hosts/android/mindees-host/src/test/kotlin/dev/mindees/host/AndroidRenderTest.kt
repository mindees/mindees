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

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import com.google.android.flexbox.AlignItems
import com.google.android.flexbox.AlignSelf
import com.google.android.flexbox.FlexDirection
import com.google.android.flexbox.FlexWrap
import com.google.android.flexbox.FlexboxLayout
import com.google.android.flexbox.JustifyContent
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
    private fun newHost(): Pair<MindeesNativeHost<View>, FlexboxLayout> {
        val context = RuntimeEnvironment.getApplication()
        val container = FlexboxLayout(context)
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
    fun rendersActivityIndicatorAsTintedIndeterminateProgressBar() {
        val (host, container) = newHost()
        host.apply(
            NativeCommandCodec.decodeBatch(
                """
                [
                  {"type":"createNode","id":"s","tag":"activityindicator"},
                  {"type":"setProp","id":"s","name":"style","value":{"width":32,"height":32,"color":"#ff0000"}},
                  {"type":"insertChild","parentId":"host-root","childId":"s","index":0}
                ]
                """.trimIndent(),
            ),
        )
        val spinner = container.getChildAt(0)
        assertTrue(spinner is ProgressBar)
        assertTrue((spinner as ProgressBar).isIndeterminate)
        assertEquals(Color.RED, spinner.indeterminateTintList?.defaultColor)
    }

    @Test
    fun wiresClickHandlerThatDispatches() {
        val fired = mutableListOf<String>()
        val context = RuntimeEnvironment.getApplication()
        val container = FlexboxLayout(context)
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

    @Test
    fun composesTextNodeChildrenIntoTextElement() {
        // Atlas Text renders as a `text` ELEMENT wrapping a text NODE. A TextView can't hold
        // child views, so the element must compose its text-node children into its own text.
        val (host, container) = newHost()
        host.apply(
            NativeCommandCodec.decodeBatch(
                """
                [
                  {"type":"createNode","id":"label","tag":"text"},
                  {"type":"createText","id":"s","text":"Hello"},
                  {"type":"insertChild","parentId":"label","childId":"s","index":0},
                  {"type":"insertChild","parentId":"host-root","childId":"label","index":0}
                ]
                """.trimIndent(),
            ),
        )
        // The element is the single TextView child of the container, carrying the composed text.
        assertEquals(1, container.childCount)
        val label = container.getChildAt(0) as TextView
        assertEquals("Hello", label.text.toString())

        // A reactive updateText on the text node re-composes the owning element.
        host.apply(NativeCommandCodec.decodeBatch("""[{"type":"updateText","id":"s","text":"World"}]"""))
        assertEquals("World", label.text.toString())
    }

    @Test
    fun appliesAtlasFlexBoxAndVisualStyle() {
        val (host, container) = newHost()
        host.apply(
            NativeCommandCodec.decodeBatch(
                """
                [
                  {"type":"createNode","id":"row","tag":"view"},
                  {"type":"setProp","id":"row","name":"style","value":{
                    "flexDirection":"row","gap":12,"padding":16,"backgroundColor":"#161b2e",
                    "borderRadius":20,"justifyContent":"center","alignItems":"center","width":"100%"
                  }},
                  {"type":"createText","id":"a","text":"A"},
                  {"type":"createText","id":"b","text":"B"},
                  {"type":"insertChild","parentId":"row","childId":"a","index":0},
                  {"type":"insertChild","parentId":"row","childId":"b","index":1},
                  {"type":"insertChild","parentId":"host-root","childId":"row","index":0}
                ]
                """.trimIndent(),
            ),
        )
        val row = container.getChildAt(0) as FlexboxLayout
        // flexDirection:'row' → ROW; justify center; align center.
        assertEquals(FlexDirection.ROW, row.flexDirection)
        assertEquals(JustifyContent.CENTER, row.justifyContent)
        assertEquals(AlignItems.CENTER, row.alignItems)
        // backgroundColor/borderRadius → a GradientDrawable background; padding applied.
        assertTrue(row.background is GradientDrawable)
        assertTrue(row.paddingTop > 0)
        // width:'100%' → MATCH_PARENT layout param.
        assertEquals(ViewGroup.LayoutParams.MATCH_PARENT, row.layoutParams.width)
        // gap → leading margin on every child but the first (along the row axis).
        assertEquals(0, (row.getChildAt(0).layoutParams as FlexboxLayout.LayoutParams).leftMargin)
        assertTrue((row.getChildAt(1).layoutParams as FlexboxLayout.LayoutParams).leftMargin > 0)
    }

    @Test
    fun appliesFullFlexParity() {
        // What LinearLayout couldn't do: space-between distribution, flex-wrap, and per-child alignSelf.
        val (host, container) = newHost()
        host.apply(
            NativeCommandCodec.decodeBatch(
                """
                [
                  {"type":"createNode","id":"row","tag":"view"},
                  {"type":"setProp","id":"row","name":"style","value":{
                    "flexDirection":"row","justifyContent":"space-between","flexWrap":"wrap"
                  }},
                  {"type":"createNode","id":"a","tag":"view"},
                  {"type":"setProp","id":"a","name":"style","value":{"alignSelf":"center","flexGrow":2}},
                  {"type":"insertChild","parentId":"row","childId":"a","index":0},
                  {"type":"insertChild","parentId":"host-root","childId":"row","index":0}
                ]
                """.trimIndent(),
            ),
        )
        val row = container.getChildAt(0) as FlexboxLayout
        assertEquals(JustifyContent.SPACE_BETWEEN, row.justifyContent)
        assertEquals(FlexWrap.WRAP, row.flexWrap)
        val childLp = row.getChildAt(0).layoutParams as FlexboxLayout.LayoutParams
        assertEquals(AlignSelf.CENTER, childLp.alignSelf)
        assertEquals(2f, childLp.flexGrow, 0.001f)
    }

    @Test
    fun appliesAtlasTextStyle() {
        val (host, container) = newHost()
        host.apply(
            NativeCommandCodec.decodeBatch(
                """
                [
                  {"type":"createText","id":"t","text":"Big"},
                  {"type":"setProp","id":"t","name":"style","value":{
                    "color":"#5b8cff","fontSize":40,"fontWeight":700,"textAlign":"center"
                  }},
                  {"type":"insertChild","parentId":"host-root","childId":"t","index":0}
                ]
                """.trimIndent(),
            ),
        )
        val label = container.getChildAt(0) as TextView
        assertEquals(Color.parseColor("#5b8cff"), label.currentTextColor)
        assertTrue(label.textSize > 0f)
        assertEquals(Gravity.CENTER, label.gravity)
        // Note: fontWeight→bold is applied by the renderer (setTypeface BOLD) but Robolectric
        // doesn't faithfully model typeface style / synthetic bold, so it isn't asserted here;
        // it is exercised by the on-device example and visible at runtime.
    }

    @Test
    fun wiresAtlasClickEventOnAView() {
        // Atlas's Pressable emits onClick → wire event "click" (not "press"); a plain
        // styled 'view' (how Atlas Button renders) must still be tappable.
        val fired = mutableListOf<String>()
        val context = RuntimeEnvironment.getApplication()
        val container = FlexboxLayout(context)
        val host = MindeesNativeHost<View>("host-root", container, AndroidViewRenderer(context)) {
            fired.add(it)
        }
        host.apply(
            NativeCommandCodec.decodeBatch(
                """
                [
                  {"type":"createNode","id":"v","tag":"view"},
                  {"type":"registerEvent","id":"v","eventName":"click","handlerId":"inc"},
                  {"type":"insertChild","parentId":"host-root","childId":"v","index":0}
                ]
                """.trimIndent(),
            ),
        )
        container.getChildAt(0).performClick()
        assertEquals(listOf("inc"), fired)
    }
}
