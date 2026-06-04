package dev.mindees.example

import android.app.Activity
import android.content.res.Configuration
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import dev.mindees.host.AndroidViewRenderer
import dev.mindees.host.MindeesNativeHost

class MainActivity : Activity() {
    private var bridge: MindeesRuntimeBridge<View>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Fill the window and paint a dark base: the Atlas app controls its own layout and
        // background edge-to-edge, so the host window should match it (no light gaps showing
        // through where content hasn't laid out yet).
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(Color.parseColor("#0b1021"))
        }
        val renderer = AndroidViewRenderer(this)
        val mainHandler = Handler(Looper.getMainLooper())

        val host = MindeesNativeHost<View>(
            rootId = HOST_ROOT_ID,
            root = root,
            renderer = renderer,
            onEvent = { handlerId ->
                bridge?.dispatchEvent(handlerId)
                    ?: error("Mindees runtime bridge has not started")
            },
        )

        // The real Atlas + Helix app, bundled to a QuickJS-safe IIFE (app-js/, regenerate
        // with `pnpm run build:android-example-js`). It runs @mindees/core signals +
        // @mindees/atlas primitives + the @mindees/renderer reconciler inside QuickJS and
        // emits the native command stream this host materializes — not hand-written commands.
        val appJs = assets.open(APP_BUNDLE_ASSET).bufferedReader().use { it.readText() }

        bridge = MindeesRuntimeBridge(
            host = host,
            runtime = QuickJsMindeesRuntime(appJs, environmentJson()),
            applyOnHostThread = { action ->
                if (Looper.myLooper() == Looper.getMainLooper()) {
                    action()
                } else {
                    mainHandler.post(action)
                }
            },
        ).also { it.start() }

        setContentView(root)
    }

    override fun onDestroy() {
        bridge?.close()
        bridge = null
        super.onDestroy()
    }

    /**
     * The platform environment for `@mindees/atlas` device hooks (useWindowDimensions,
     * useColorScheme, …), as JSON. Logical dp = pixels / density.
     */
    private fun environmentJson(): String {
        val dm = resources.displayMetrics
        val cfg = resources.configuration
        val widthDp = (dm.widthPixels / dm.density)
        val heightDp = (dm.heightPixels / dm.density)
        val isDark =
            (cfg.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        return """
            {"window":{"width":$widthDp,"height":$heightDp,"scale":${dm.density},""" +
            """"fontScale":${cfg.fontScale}},"colorScheme":"${if (isDark) "dark" else "light"}"}
            """.trimIndent()
    }

    private companion object {
        const val HOST_ROOT_ID = "host-root"

        /** The bundled real Atlas + Helix app (see app-js/ + tsdown.config.ts). */
        const val APP_BUNDLE_ASSET = "mindees-app.bundle.js"
    }
}
