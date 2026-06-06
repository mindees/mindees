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
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import com.google.android.flexbox.AlignItems
import com.google.android.flexbox.AlignSelf
import com.google.android.flexbox.FlexDirection
import com.google.android.flexbox.FlexWrap
import com.google.android.flexbox.FlexboxLayout
import com.google.android.flexbox.JustifyContent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
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
        val host = MindeesNativeHost<View>("host-root", container, AndroidViewRenderer(context)) { _, _ -> }
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
        val host = MindeesNativeHost<View>("host-root", container, AndroidViewRenderer(context)) { id, _ ->
            fired.add(id)
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
    fun rendersScrollViewWrappingFlexContent() {
        val (host, container) = newHost()
        host.apply(
            NativeCommandCodec.decodeBatch(
                """
                [
                  {"type":"createNode","id":"sv","tag":"scrollview"},
                  {"type":"setProp","id":"sv","name":"style","value":{"flexDirection":"column","gap":8,"height":"100%"}},
                  {"type":"createText","id":"a","text":"Row A"},
                  {"type":"insertChild","parentId":"sv","childId":"a","index":0},
                  {"type":"insertChild","parentId":"host-root","childId":"sv","index":0}
                ]
                """.trimIndent(),
            ),
        )
        val sv = container.getChildAt(0) as ScrollView
        val content = sv.getChildAt(0) as FlexboxLayout
        // Children route into the inner content host, not the ScrollView (which holds one child).
        assertEquals(1, content.childCount)
        assertEquals("Row A", (content.getChildAt(0) as TextView).text.toString())
        // Flex style targets the content; height:'100%' sizes the ScrollView viewport.
        assertEquals(FlexDirection.COLUMN, content.flexDirection)
        assertEquals(ViewGroup.LayoutParams.MATCH_PARENT, sv.layoutParams.height)
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
    fun appliesElevationPerCornerRadiusAndLineClamp() {
        val (host, container) = newHost()
        host.apply(
            NativeCommandCodec.decodeBatch(
                """
                [
                  {"type":"createNode","id":"card","tag":"view"},
                  {"type":"setProp","id":"card","name":"style","value":{
                    "elevation":6,"backgroundColor":"#222222",
                    "borderTopLeftRadius":16,"borderBottomRightRadius":4
                  }},
                  {"type":"createNode","id":"t","tag":"text"},
                  {"type":"setProp","id":"t","name":"style","value":{"numberOfLines":1}},
                  {"type":"createText","id":"s","text":"a very long line that should be clamped"},
                  {"type":"insertChild","parentId":"t","childId":"s","index":0},
                  {"type":"insertChild","parentId":"card","childId":"t","index":0},
                  {"type":"insertChild","parentId":"host-root","childId":"card","index":0}
                ]
                """.trimIndent(),
            ),
        )
        val card = container.getChildAt(0) as FlexboxLayout
        assertTrue(card.elevation > 0f) // elevation → shadow
        assertTrue(card.background is GradientDrawable) // per-corner radii applied without crashing
        val label = card.getChildAt(0) as TextView
        assertEquals(1, label.maxLines) // numberOfLines → maxLines + ellipsize
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
        val host = MindeesNativeHost<View>("host-root", container, AndroidViewRenderer(context)) { id, _ ->
            fired.add(id)
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

    @Test
    fun loadsBase64DataUriImageWithScaleTypeAndTint() {
        val (host, container) = newHost()
        val png =
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
        host.apply(
            NativeCommandCodec.decodeBatch(
                """
                [
                  {"type":"createNode","id":"img","tag":"image"},
                  {"type":"setProp","id":"img","name":"src","value":"$png"},
                  {"type":"setProp","id":"img","name":"resizeMode","value":"cover"},
                  {"type":"setProp","id":"img","name":"tintColor","value":"#ff0000"},
                  {"type":"insertChild","parentId":"host-root","childId":"img","index":0}
                ]
                """.trimIndent(),
            ),
        )
        val img = container.getChildAt(0) as ImageView
        // resizeMode + tintColor are deterministic View state (the mappings we own). The actual base64
        // bitmap decode is platform BitmapFactory behavior (verified on real devices) — Robolectric's
        // ShadowBitmapFactory does not faithfully decode raw byte arrays, so we assert our mappings here,
        // and that the data-URI path ran without throwing (a non-image/garbage case is covered below).
        assertEquals(ImageView.ScaleType.CENTER_CROP, img.scaleType) // resizeMode:'cover'
        assertNotNull(img.colorFilter) // tintColor applied
    }

    @Test
    fun ignoresGarbageImageSourceWithoutCrashing() {
        val (host, container) = newHost()
        host.apply(
            NativeCommandCodec.decodeBatch(
                """
                [
                  {"type":"createNode","id":"img","tag":"image"},
                  {"type":"setProp","id":"img","name":"src","value":"data:image/png;base64,@@not-valid@@"},
                  {"type":"insertChild","parentId":"host-root","childId":"img","index":0}
                ]
                """.trimIndent(),
            ),
        )
        assertTrue(container.getChildAt(0) is ImageView) // no exception thrown is the assertion
    }

    @Test
    fun mapsTextInputKeyboardSecureAndMultiline() {
        val (host, container) = newHost()
        host.apply(
            NativeCommandCodec.decodeBatch(
                """
                [
                  {"type":"createNode","id":"a","tag":"textinput"},
                  {"type":"setProp","id":"a","name":"keyboardType","value":"email"},
                  {"type":"createNode","id":"b","tag":"textinput"},
                  {"type":"setProp","id":"b","name":"keyboardType","value":"number"},
                  {"type":"setProp","id":"b","name":"multiline","value":true},
                  {"type":"createNode","id":"c","tag":"textinput"},
                  {"type":"setProp","id":"c","name":"secureTextEntry","value":true},
                  {"type":"setProp","id":"c","name":"editable","value":false},
                  {"type":"insertChild","parentId":"host-root","childId":"a","index":0},
                  {"type":"insertChild","parentId":"host-root","childId":"b","index":1},
                  {"type":"insertChild","parentId":"host-root","childId":"c","index":2}
                ]
                """.trimIndent(),
            ),
        )
        val a = container.getChildAt(0) as EditText
        assertEquals(
            InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,
            a.inputType and InputType.TYPE_MASK_VARIATION,
        )
        val b = container.getChildAt(1) as EditText
        assertEquals(InputType.TYPE_CLASS_NUMBER, b.inputType and InputType.TYPE_MASK_CLASS)
        assertTrue((b.inputType and InputType.TYPE_TEXT_FLAG_MULTI_LINE) != 0) // multiline flag
        val c = container.getChildAt(2) as EditText
        assertTrue((c.inputType and InputType.TYPE_TEXT_VARIATION_PASSWORD) != 0) // secure
        assertFalse(c.isEnabled) // editable:false
    }

    @Test
    fun wiresTextChangeWatcherThatDispatchesAndDetaches() {
        val fired = mutableListOf<Pair<String, String?>>()
        val context = RuntimeEnvironment.getApplication()
        val container = FlexboxLayout(context)
        val host = MindeesNativeHost<View>("host-root", container, AndroidViewRenderer(context)) { id, value ->
            fired.add(id to value)
        }
        host.apply(
            NativeCommandCodec.decodeBatch(
                """
                [
                  {"type":"createNode","id":"a","tag":"textinput"},
                  {"type":"registerEvent","id":"a","eventName":"input","handlerId":"ch1"},
                  {"type":"insertChild","parentId":"host-root","childId":"a","index":0}
                ]
                """.trimIndent(),
            ),
        )
        val et = container.getChildAt(0) as EditText
        et.setText("abc") // Robolectric runs the TextWatcher synchronously
        assertEquals(listOf("ch1" to "abc"), fired) // the typed text reaches onEvent (not just the id)
        host.apply(
            NativeCommandCodec.decodeBatch(
                """[{"type":"unregisterEvent","id":"a","eventName":"input","handlerId":"ch1"}]""",
            ),
        )
        et.setText("def")
        assertEquals(listOf("ch1" to "abc"), fired) // detached → no further dispatch
    }

    @Test
    fun rendersHorizontalScrollViewWrappingRowContent() {
        val (host, container) = newHost()
        host.apply(
            NativeCommandCodec.decodeBatch(
                """
                [
                  {"type":"createNode","id":"row","tag":"horizontalscrollview"},
                  {"type":"setProp","id":"row","name":"style","value":{"gap":10}},
                  {"type":"createText","id":"a","text":"A"},
                  {"type":"createText","id":"b","text":"B"},
                  {"type":"insertChild","parentId":"row","childId":"a","index":0},
                  {"type":"insertChild","parentId":"row","childId":"b","index":1},
                  {"type":"insertChild","parentId":"host-root","childId":"row","index":0}
                ]
                """.trimIndent(),
            ),
        )
        val sv = container.getChildAt(0) as HorizontalScrollView
        val content = sv.getChildAt(0) as FlexboxLayout
        assertEquals(FlexDirection.ROW, content.flexDirection)
        assertEquals(2, content.childCount) // children route into the content host
        // gap → leading LEFT margin on the 2nd child (X axis), 0 on the first.
        assertEquals(0, (content.getChildAt(0).layoutParams as FlexboxLayout.LayoutParams).leftMargin)
        assertTrue((content.getChildAt(1).layoutParams as FlexboxLayout.LayoutParams).leftMargin > 0)
    }

    @Test
    fun supportsBothInputAndChangeWatchersIndependently() {
        val fired = mutableListOf<Pair<String, String?>>()
        val context = RuntimeEnvironment.getApplication()
        val container = FlexboxLayout(context)
        val host = MindeesNativeHost<View>("host-root", container, AndroidViewRenderer(context)) { id, value ->
            fired.add(id to value)
        }
        host.apply(
            NativeCommandCodec.decodeBatch(
                """
                [
                  {"type":"createNode","id":"a","tag":"textinput"},
                  {"type":"registerEvent","id":"a","eventName":"input","handlerId":"in1"},
                  {"type":"registerEvent","id":"a","eventName":"change","handlerId":"ch1"},
                  {"type":"insertChild","parentId":"host-root","childId":"a","index":0}
                ]
                """.trimIndent(),
            ),
        )
        val et = container.getChildAt(0) as EditText
        et.setText("x") // both watchers fire, each carrying the field text
        assertTrue(fired.contains("in1" to "x"))
        assertTrue(fired.contains("ch1" to "x"))
        fired.clear()
        host.apply(
            NativeCommandCodec.decodeBatch(
                """[{"type":"unregisterEvent","id":"a","eventName":"input","handlerId":"in1"}]""",
            ),
        )
        et.setText("y") // input detached; change still fires
        assertEquals(listOf("ch1" to "y"), fired)
    }
}
