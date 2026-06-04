package dev.mindees.example

import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.LinearLayout
import dev.mindees.host.AndroidViewRenderer
import dev.mindees.host.MindeesNativeHost

class MainActivity : Activity() {
    private var bridge: MindeesRuntimeBridge<View>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 32, 32, 32)
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

        bridge = MindeesRuntimeBridge(
            host = host,
            runtime = QuickJsMindeesRuntime(COUNTER_APP_JS),
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

    private companion object {
        const val HOST_ROOT_ID = "host-root"

        val COUNTER_APP_JS = """
            const ids = {
              screen: "counter-screen",
              label: "counter-label",
              button: "counter-button"
            };
            let count = 0;
            let mounted = false;

            function emit(commands) {
              MindeesHost.emit(JSON.stringify(commands));
            }

            function renderCount() {
              emit([{ type: "updateText", id: ids.label, text: `Count: ${'$'}{count}` }]);
            }

            globalThis.MindeesApp = {
              start() {
                if (mounted) return;
                mounted = true;
                emit([
                  { type: "createNode", id: ids.screen, tag: "view" },
                  { type: "createText", id: ids.label, text: "Count: 0" },
                  { type: "createNode", id: ids.button, tag: "button" },
                  {
                    type: "setProp",
                    id: ids.button,
                    name: "title",
                    value: "Increment"
                  },
                  {
                    type: "registerEvent",
                    id: ids.button,
                    eventName: "press",
                    handlerId: "counter.increment"
                  },
                  {
                    type: "insertChild",
                    parentId: ids.screen,
                    childId: ids.label,
                    index: 0
                  },
                  {
                    type: "insertChild",
                    parentId: ids.screen,
                    childId: ids.button,
                    index: 1
                  },
                  {
                    type: "insertChild",
                    parentId: "$HOST_ROOT_ID",
                    childId: ids.screen,
                    index: 0
                  }
                ]);
              },

              dispatchEvent(handlerId) {
                if (handlerId !== "counter.increment") return;
                count += 1;
                renderCount();
              }
            };
        """.trimIndent()
    }
}
