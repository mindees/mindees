package dev.mindees.example

import app.cash.quickjs.QuickJs
import dev.mindees.host.MindeesNativeHost
import dev.mindees.host.NativeCommandCodec
import java.io.Closeable

interface NativeCommandSink {
    fun applyBatch(json: String)
}

interface MindeesScriptRuntime : Closeable {
    fun start(sink: NativeCommandSink)
    fun dispatchEvent(handlerId: String, value: String?)

    /** Advance animations by one vsync frame (time in ms). Drives `MindeesApp.frameTick`. */
    fun frameTick(nowMs: Double)
}

class MindeesRuntimeBridge<V>(
    private val host: MindeesNativeHost<V>,
    private val runtime: MindeesScriptRuntime,
    private val applyOnHostThread: ((() -> Unit) -> Unit) = { it() },
) : NativeCommandSink, Closeable {
    private var started = false

    fun start() {
        check(!started) { "Mindees runtime bridge already started" }
        try {
            runtime.start(this)
            started = true
        } catch (t: Throwable) {
            try {
                runtime.close()
            } catch (closeError: Throwable) {
                t.addSuppressed(closeError)
            }
            throw t
        }
    }

    override fun applyBatch(json: String) {
        applyOnHostThread {
            host.apply(NativeCommandCodec.decodeBatch(json))
        }
    }

    fun dispatchEvent(handlerId: String, value: String?) {
        check(started) { "Mindees runtime bridge has not started" }
        runtime.dispatchEvent(handlerId, value)
    }

    /** Forward a vsync frame to the JS animation engine (called by the [FrameDriver]). */
    fun frameTick(nowMs: Double) {
        if (started) runtime.frameTick(nowMs)
    }

    override fun close() {
        if (started) {
            try {
                runtime.close()
            } finally {
                started = false
            }
        }
    }
}

interface MindeesHostApi {
    fun emit(json: String)
}

/** Supplies the platform environment (window size, color scheme, …) to the bundle. */
interface MindeesEnvApi {
    fun get(): String
}

/** The JS→host battery signal: `createNativeApp` asks the host to run / stop its vsync loop. */
interface MindeesFrameApi {
    fun setFrameLoopActive(active: Boolean)
}

interface MindeesAppApi {
    fun start()
    fun dispatchEvent(handlerId: String, value: String?)
    fun frameTick(nowMs: Double)
}

class QuickJsMindeesRuntime(
    private val source: String,
    /** JSON for `setEnvironment` (window dimensions, color scheme, …). Default: empty. */
    private val environmentJson: String = "{}",
    /** Called when the JS engine arms (true) / sleeps (false) its animation loop — drive the [FrameDriver]. */
    private val onFrameLoopActive: (Boolean) -> Unit = {},
) : MindeesScriptRuntime {
    private var engine: QuickJs? = null
    private var app: MindeesAppApi? = null

    override fun start(sink: NativeCommandSink) {
        check(engine == null) { "QuickJS runtime already started" }

        val quickJs = QuickJs.create()
        try {
            quickJs.set(
                "MindeesHost",
                MindeesHostApi::class.java,
                object : MindeesHostApi {
                    override fun emit(json: String) {
                        sink.applyBatch(json)
                    }
                },
            )
            // Injected before evaluate so the bundle's entry can read it and call
            // setEnvironment() before the first render.
            quickJs.set(
                "MindeesEnv",
                MindeesEnvApi::class.java,
                object : MindeesEnvApi {
                    override fun get(): String = environmentJson
                },
            )
            // Injected before evaluate so createNativeApp installs the vsync frame source. The JS
            // engine calls this to start/stop the host's Choreographer loop (battery: only while
            // something is animating).
            quickJs.set(
                "MindeesHostFrame",
                MindeesFrameApi::class.java,
                object : MindeesFrameApi {
                    override fun setFrameLoopActive(active: Boolean) {
                        onFrameLoopActive(active)
                    }
                },
            )
            quickJs.evaluate(source, "mindees-example.js")
            val mindeesApp = quickJs.get("MindeesApp", MindeesAppApi::class.java)
            mindeesApp.start()
            engine = quickJs
            app = mindeesApp
        } catch (t: Throwable) {
            quickJs.close()
            throw t
        }
    }

    override fun dispatchEvent(handlerId: String, value: String?) {
        app?.dispatchEvent(handlerId, value)
            ?: error("QuickJS MindeesApp has not started")
    }

    override fun frameTick(nowMs: Double) {
        app?.frameTick(nowMs)
    }

    override fun close() {
        app = null
        engine?.close()
        engine = null
    }
}
