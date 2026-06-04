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
    fun dispatchEvent(handlerId: String)
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

    fun dispatchEvent(handlerId: String) {
        check(started) { "Mindees runtime bridge has not started" }
        runtime.dispatchEvent(handlerId)
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

interface MindeesAppApi {
    fun start()
    fun dispatchEvent(handlerId: String)
}

class QuickJsMindeesRuntime(private val source: String) : MindeesScriptRuntime {
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

    override fun dispatchEvent(handlerId: String) {
        app?.dispatchEvent(handlerId)
            ?: error("QuickJS MindeesApp has not started")
    }

    override fun close() {
        app = null
        engine?.close()
        engine = null
    }
}
