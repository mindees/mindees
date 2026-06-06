package dev.mindees.example

import dev.mindees.host.MindeesNativeHost
import dev.mindees.host.ModelNode
import dev.mindees.host.ModelRenderer
import dev.mindees.host.NativeProp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class MindeesRuntimeBridgeTest {
    @Test
    fun startAppliesRuntimeCommandBatch() {
        val runtime = RecordingRuntime()
        val renderer = ModelRenderer()
        val root = renderer.makeElement("root")
        lateinit var bridge: MindeesRuntimeBridge<ModelNode>
        val host = MindeesNativeHost(
            rootId = "host-root",
            root = root,
            renderer = renderer,
            onEvent = { handlerId, value -> bridge.dispatchEvent(handlerId, value) },
        )

        bridge = MindeesRuntimeBridge(host, runtime)
        bridge.start()

        assertEquals("<view>Count: 0<button></button></view>", inner(root))
        val button = root.children.single().children[1]
        assertEquals(NativeProp.Str("Increment"), button.props["title"])
        assertEquals("counter.increment", button.events["press"])
    }

    @Test
    fun dispatchEventRoundTripsBackToRuntime() {
        val runtime = RecordingRuntime()
        val renderer = ModelRenderer()
        val root = renderer.makeElement("root")
        val host = MindeesNativeHost("host-root", root, renderer) { _, _ -> }
        val bridge = MindeesRuntimeBridge(host, runtime)

        bridge.start()
        bridge.dispatchEvent("counter.increment", null)

        assertEquals(listOf("counter.increment"), runtime.dispatched)
        assertEquals("<view>Count: 1<button></button></view>", inner(root))
    }

    @Test
    fun frameTickRoundTripsToRuntime() {
        val runtime = RecordingRuntime()
        val renderer = ModelRenderer()
        val root = renderer.makeElement("root")
        val host = MindeesNativeHost("host-root", root, renderer) { _, _ -> }
        val bridge = MindeesRuntimeBridge(host, runtime)

        bridge.start()
        bridge.frameTick(16.0)
        bridge.frameTick(32.0)

        assertEquals(listOf(16.0, 32.0), runtime.frameTicks)
    }

    @Test
    fun frameTickBeforeStartIsIgnored() {
        val runtime = RecordingRuntime()
        val renderer = ModelRenderer()
        val root = renderer.makeElement("root")
        val host = MindeesNativeHost("host-root", root, renderer) { _, _ -> }
        val bridge = MindeesRuntimeBridge(host, runtime)

        bridge.frameTick(16.0) // not started yet → no-op, no throw
        assertEquals(emptyList<Double>(), runtime.frameTicks)
    }

    @Test
    fun rejectsDispatchBeforeStart() {
        val runtime = RecordingRuntime()
        val renderer = ModelRenderer()
        val root = renderer.makeElement("root")
        val host = MindeesNativeHost("host-root", root, renderer) { _, _ -> }
        val bridge = MindeesRuntimeBridge(host, runtime)

        assertThrows(IllegalStateException::class.java) {
            bridge.dispatchEvent("counter.increment", null)
        }
    }

    @Test
    fun startFailureClosesRuntimeAndDoesNotMarkStarted() {
        val runtime = FailingRuntime()
        val renderer = ModelRenderer()
        val root = renderer.makeElement("root")
        val host = MindeesNativeHost("host-root", root, renderer) { _, _ -> }
        val bridge = MindeesRuntimeBridge(host, runtime)

        assertThrows(IllegalStateException::class.java) {
            bridge.start()
        }
        assertEquals(1, runtime.closeCount)
        assertThrows(IllegalStateException::class.java) {
            bridge.dispatchEvent("counter.increment", null)
        }
    }

    @Test
    fun closeFailureStillMarksBridgeAsClosed() {
        val runtime = CloseFailingRuntime()
        val renderer = ModelRenderer()
        val root = renderer.makeElement("root")
        val host = MindeesNativeHost("host-root", root, renderer) { _, _ -> }
        val bridge = MindeesRuntimeBridge(host, runtime)

        bridge.start()
        assertThrows(IllegalStateException::class.java) {
            bridge.close()
        }
        assertEquals(1, runtime.closeCount)

        bridge.close()
        assertEquals(1, runtime.closeCount)
        assertThrows(IllegalStateException::class.java) {
            bridge.dispatchEvent("counter.increment", null)
        }
    }

    private fun inner(root: ModelNode): String = root.children.joinToString("") { it.serialize() }

    private class RecordingRuntime : MindeesScriptRuntime {
        val dispatched = mutableListOf<String>()
        val frameTicks = mutableListOf<Double>()
        private var sink: NativeCommandSink? = null

        override fun start(sink: NativeCommandSink) {
            this.sink = sink
            sink.applyBatch(
                """
                [
                  {"type":"createNode","id":"screen","tag":"view"},
                  {"type":"createText","id":"label","text":"Count: 0"},
                  {"type":"createNode","id":"button","tag":"button"},
                  {"type":"setProp","id":"button","name":"title","value":"Increment"},
                  {
                    "type":"registerEvent",
                    "id":"button",
                    "eventName":"press",
                    "handlerId":"counter.increment"
                  },
                  {"type":"insertChild","parentId":"screen","childId":"label","index":0},
                  {"type":"insertChild","parentId":"screen","childId":"button","index":1},
                  {"type":"insertChild","parentId":"host-root","childId":"screen","index":0}
                ]
                """.trimIndent(),
            )
        }

        override fun dispatchEvent(handlerId: String, value: String?) {
            dispatched.add(handlerId)
            if (handlerId == "counter.increment") {
                sink?.applyBatch(
                    """
                    [
                      {"type":"updateText","id":"label","text":"Count: 1"}
                    ]
                    """.trimIndent(),
                )
            }
        }

        override fun frameTick(nowMs: Double) {
            frameTicks.add(nowMs)
        }

        override fun close() {
            sink = null
        }
    }

    private class FailingRuntime : MindeesScriptRuntime {
        var closeCount = 0

        override fun start(sink: NativeCommandSink) {
            throw IllegalStateException("startup failed")
        }

        override fun dispatchEvent(handlerId: String, value: String?) {
            throw AssertionError("dispatchEvent should not be called after failed startup")
        }

        override fun frameTick(nowMs: Double) = Unit

        override fun close() {
            closeCount += 1
        }
    }

    private class CloseFailingRuntime : MindeesScriptRuntime {
        var closeCount = 0

        override fun start(sink: NativeCommandSink) = Unit

        override fun dispatchEvent(handlerId: String, value: String?) {
            throw AssertionError("dispatchEvent should not be called after failed close")
        }

        override fun frameTick(nowMs: Double) = Unit

        override fun close() {
            closeCount += 1
            throw IllegalStateException("close failed")
        }
    }
}
