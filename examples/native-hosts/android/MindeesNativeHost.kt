/*
 * MindeesNativeHost.kt
 *
 * ⚠️ REFERENCE STUB — NOT A PRODUCTION HOST, NOT COMPILED IN CI.
 *
 * Illustrates how an Android host would consume the MindeesNative "native command
 * protocol" emitted by `@mindees/renderer`'s createNativeCommandBackend(). It maps
 * commands to android.view widgets, stores nodes by id, and exposes an event
 * callback. Props/accessibility are placeholders. It does NOT yet render a real
 * MindeesNative app — that is Phase 8C.
 *
 * Protocol source of truth: packages/renderer/src/native-protocol.ts
 */

package dev.mindees.host

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject

/**
 * Applies a native command stream (decoded JSON) to an Android view tree.
 *
 * @param context  Android context used to construct views.
 * @param root     The host's pre-existing root container.
 * @param rootId   The backend's `rootId` (the parentId of top-level inserts).
 * @param onEvent  Should call back into the JS runtime's
 *                 `backend.dispatchEvent(handlerId, payload)`. Wiring that bridge
 *                 is out of scope for this stub.
 */
class MindeesNativeHost(
    private val context: Context,
    root: ViewGroup,
    rootId: String,
    private val onEvent: (handlerId: String, payload: Map<String, Any?>) -> Unit,
) {
    private val nodes = HashMap<String, View>()
    /** node id → (eventName → handlerId). */
    private val handlers = HashMap<String, MutableMap<String, String>>()

    init {
        nodes[rootId] = root
    }

    /** Apply a batch encoded as a JSON array of commands. */
    fun apply(batchJson: String) {
        val array = JSONArray(batchJson)
        for (i in 0 until array.length()) apply(array.getJSONObject(i))
    }

    fun apply(cmd: JSONObject) {
        // Node ids are string|number on the wire; this stub normalizes to String.
        fun id(key: String) = cmd.get(key).toString()
        when (cmd.getString("type")) {
            "createNode" -> nodes[id("id")] = makeView(cmd.getString("tag"))
            "createText" -> nodes[id("id")] = TextView(context).apply { text = cmd.getString("text") }
            "updateText" -> (nodes[id("id")] as? TextView)?.text = cmd.getString("text")
            "setProp" -> applyProp(nodes[id("id")], cmd.getString("name"), cmd.opt("value"))
            "removeProp" -> applyProp(nodes[id("id")], cmd.getString("name"), null)
            "insertChild" -> {
                val parent = nodes[id("parentId")] as? ViewGroup ?: return
                val child = nodes[id("childId")] ?: return
                // A child can only have one parent; detach first in case this is a move.
                (child.parent as? ViewGroup)?.removeView(child)
                parent.addView(child, cmd.getInt("index").coerceAtMost(parent.childCount))
            }
            "removeChild" -> {
                val child = nodes[id("childId")] ?: return
                (child.parent as? ViewGroup)?.removeView(child)
            }
            "disposeNode" -> {
                val key = id("id")
                (nodes[key]?.parent as? ViewGroup)?.removeView(nodes[key])
                nodes.remove(key)
                handlers.remove(key)
            }
            "registerEvent" -> register(id("id"), cmd.getString("eventName"), cmd.getString("handlerId"))
            "unregisterEvent" -> {
                handlers[id("id")]?.remove(cmd.getString("eventName"))
                if (cmd.getString("eventName") == "press") nodes[id("id")]?.setOnClickListener(null)
            }
            else -> { /* unknown command — ignore in this stub */ }
        }
    }

    // --- mapping helpers (placeholders — Phase 8C fills these in) ---

    private fun makeView(tag: String): View = when (tag) {
        "text" -> TextView(context)
        "button" -> Button(context)
        else -> LinearLayout(context) // view, scrollview, … → container placeholders
    }

    private fun applyProp(view: View?, name: String, value: Any?) {
        // Reference only: a real host maps contentDescription, background, layout
        // params, etc. Here we demonstrate a single mapping.
        if (view != null && name == "accessibilityLabel") {
            view.contentDescription = value as? String
        }
    }

    private fun register(nodeId: String, eventName: String, handlerId: String) {
        val view = nodes[nodeId] ?: return
        if (eventName != "press") return
        handlers.getOrPut(nodeId) { mutableMapOf() }[eventName] = handlerId
        view.setOnClickListener { onEvent(handlerId, emptyMap()) }
    }
}
