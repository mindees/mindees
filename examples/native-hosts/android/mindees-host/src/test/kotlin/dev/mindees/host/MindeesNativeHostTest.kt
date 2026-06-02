/*
 * MindeesNativeHostTest.kt — verifies the host's command-apply + validation logic
 * with the in-memory ModelRenderer (pure JVM → runs via `./gradlew test`, no device).
 *
 * Mirrors @mindees/renderer's TypeScript conformance suite.
 *
 * ⚠️ Authored, not yet run by the maintainers — please `./gradlew test` and report.
 */

package dev.mindees.host

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class MindeesNativeHostTest {
    private fun makeHost(onEvent: (String) -> Unit = {}): Pair<MindeesNativeHost<ModelNode>, ModelNode> {
        val renderer = ModelRenderer()
        val root = renderer.makeElement("root")
        val host = MindeesNativeHost("host-root", root, renderer, onEvent)
        return host to root
    }

    private fun inner(root: ModelNode) = root.children.joinToString("") { it.serialize() }

    @Test
    fun reconstructsStaticTree() {
        val (host, root) = makeHost()
        host.apply(
            listOf(
                NativeCommand.CreateNode("v", "view"),
                NativeCommand.CreateText("t", "Hello"),
                NativeCommand.InsertChild("v", "t", 0),
                NativeCommand.InsertChild("host-root", "v", 0),
            ),
        )
        assertEquals("<view>Hello</view>", inner(root))
        assertEquals(2, host.liveNodeCount)
    }

    @Test
    fun preservesSiblingOrder() {
        val (host, root) = makeHost()
        host.apply(
            listOf(
                NativeCommand.CreateText("a", "A"),
                NativeCommand.CreateText("b", "B"),
                NativeCommand.CreateText("c", "C"),
                NativeCommand.InsertChild("host-root", "a", 0),
                NativeCommand.InsertChild("host-root", "b", 1),
                NativeCommand.InsertChild("host-root", "c", 2),
            ),
        )
        assertEquals("ABC", inner(root))
    }

    @Test
    fun updatesText() {
        val (host, root) = makeHost()
        host.apply(
            listOf(
                NativeCommand.CreateText("t", "x"),
                NativeCommand.InsertChild("host-root", "t", 0),
                NativeCommand.UpdateText("t", "y"),
            ),
        )
        assertEquals("y", inner(root))
    }

    @Test
    fun leavesNoOrphansAfterDispose() {
        val (host, root) = makeHost()
        host.apply(
            listOf(
                NativeCommand.CreateNode("v", "view"),
                NativeCommand.CreateText("t", "x"),
                NativeCommand.InsertChild("v", "t", 0),
                NativeCommand.InsertChild("host-root", "v", 0),
            ),
        )
        assertEquals(2, host.liveNodeCount)
        host.apply(
            listOf(
                NativeCommand.RemoveChild("host-root", "v"),
                NativeCommand.DisposeNode("t"),
                NativeCommand.DisposeNode("v"),
            ),
        )
        assertEquals("", inner(root))
        assertEquals(0, host.liveNodeCount)
    }

    @Test
    fun wiresEvents() {
        val fired = mutableListOf<String>()
        val (host, root) = makeHost { fired.add(it) }
        host.apply(
            listOf(
                NativeCommand.CreateNode("btn", "button"),
                NativeCommand.InsertChild("host-root", "btn", 0),
                NativeCommand.RegisterEvent("btn", "press", "h1"),
            ),
        )
        assertEquals("h1", root.children.first().events["press"])
        assertTrue(fired.isEmpty()) // a real tap is exercised by AndroidViewRenderer on a device
    }

    @Test
    fun decodesJsonBatch() {
        val (host, root) = makeHost()
        val json = """
            [
              {"type":"createText","id":"t","text":"Hi"},
              {"type":"insertChild","parentId":"host-root","childId":"t","index":0}
            ]
        """.trimIndent()
        host.apply(NativeCommandCodec.decodeBatch(json))
        assertEquals("Hi", inner(root))
    }

    @Test
    fun disposingInteriorNodeDetachesFromRendererTree() {
        val (host, root) = makeHost()
        host.apply(
            listOf(
                NativeCommand.CreateNode("v", "view"),
                NativeCommand.CreateText("t", "x"),
                NativeCommand.InsertChild("v", "t", 0),
                NativeCommand.InsertChild("host-root", "v", 0),
            ),
        )
        // Dispose the interior text node while its <view> parent is still present.
        host.apply(listOf(NativeCommand.DisposeNode("t")))
        // The renderer (model) tree must no longer contain the disposed child.
        assertEquals(0, root.children.first().children.size)
        assertEquals("<view></view>", inner(root))
    }

    // --- strict validation (the conformance contract) ---

    @Test
    fun rejectsDuplicateId() {
        val (host, _) = makeHost()
        host.apply(listOf(NativeCommand.CreateNode("a", "view")))
        assertThrows(NativeHostException::class.java) { host.apply(listOf(NativeCommand.CreateNode("a", "view"))) }
    }

    @Test
    fun rejectsUnknownNode() {
        val (host, _) = makeHost()
        assertThrows(NativeHostException::class.java) { host.apply(listOf(NativeCommand.UpdateText("ghost", "x"))) }
    }

    @Test
    fun rejectsRemoveChildOfNonChild() {
        val (host, _) = makeHost()
        host.apply(
            listOf(
                NativeCommand.CreateNode("p", "view"),
                NativeCommand.CreateNode("c", "view"),
                NativeCommand.InsertChild("host-root", "p", 0),
            ),
        )
        assertThrows(NativeHostException::class.java) { host.apply(listOf(NativeCommand.RemoveChild("p", "c"))) }
    }

    @Test
    fun rejectsDoubleDispose() {
        val (host, _) = makeHost()
        host.apply(listOf(NativeCommand.CreateNode("a", "view"), NativeCommand.DisposeNode("a")))
        assertThrows(NativeHostException::class.java) { host.apply(listOf(NativeCommand.DisposeNode("a"))) }
    }

    @Test
    fun cannotDisposeRoot() {
        val (host, _) = makeHost()
        assertThrows(NativeHostException::class.java) { host.apply(listOf(NativeCommand.DisposeNode("host-root"))) }
    }
}
