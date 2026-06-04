/*
 * NativeCommand.kt — the wire model for the MindeesNative native command protocol.
 *
 * Mirrors `@mindees/renderer`'s `native-protocol.ts`. The sealed types are pure
 * Kotlin (unit-testable on the JVM); `NativeCommandCodec` decodes JSON via
 * org.json (Android) and is exercised on-device.
 *
 * CI-verified by the native Android workflow; see the module README.
 */

package dev.mindees.host

import org.json.JSONArray
import org.json.JSONObject

/** A serializable prop value (mirrors `NativePropValue`). Carries no functions. */
sealed interface NativeProp {
    data class Str(val value: String) : NativeProp
    data class Num(val value: Double) : NativeProp
    data class Bool(val value: Boolean) : NativeProp
    data object Null : NativeProp
    data class Arr(val value: List<NativeProp>) : NativeProp
    data class Obj(val value: Map<String, NativeProp>) : NativeProp
}

/** One native command (mirrors the `NativeCommand` union). */
sealed interface NativeCommand {
    data class CreateNode(val id: String, val tag: String) : NativeCommand
    data class CreateText(val id: String, val text: String) : NativeCommand
    data class SetProp(val id: String, val name: String, val value: NativeProp) : NativeCommand
    data class RemoveProp(val id: String, val name: String) : NativeCommand
    data class InsertChild(val parentId: String, val childId: String, val index: Int) : NativeCommand
    data class RemoveChild(val parentId: String, val childId: String) : NativeCommand
    data class UpdateText(val id: String, val text: String) : NativeCommand
    data class DisposeNode(val id: String) : NativeCommand
    data class RegisterEvent(val id: String, val eventName: String, val handlerId: String) : NativeCommand
    data class UnregisterEvent(val id: String, val eventName: String, val handlerId: String) : NativeCommand
}

/** Decodes a JSON command stream into [NativeCommand]s (Android: uses org.json). */
object NativeCommandCodec {
    fun decodeBatch(json: String): List<NativeCommand> {
        val array = JSONArray(json)
        return (0 until array.length()).map { decode(array.getJSONObject(it)) }
    }

    fun decode(o: JSONObject): NativeCommand {
        // Node ids are string|number on the wire; normalize to String.
        fun id(key: String): String = o.get(key).toString()
        return when (val type = o.getString("type")) {
            "createNode" -> NativeCommand.CreateNode(id("id"), o.getString("tag"))
            "createText" -> NativeCommand.CreateText(id("id"), o.getString("text"))
            "setProp" -> NativeCommand.SetProp(id("id"), o.getString("name"), decodeProp(o.get("value")))
            "removeProp" -> NativeCommand.RemoveProp(id("id"), o.getString("name"))
            "insertChild" -> NativeCommand.InsertChild(id("parentId"), id("childId"), o.getInt("index"))
            "removeChild" -> NativeCommand.RemoveChild(id("parentId"), id("childId"))
            "updateText" -> NativeCommand.UpdateText(id("id"), o.getString("text"))
            "disposeNode" -> NativeCommand.DisposeNode(id("id"))
            "registerEvent" ->
                NativeCommand.RegisterEvent(id("id"), o.getString("eventName"), o.getString("handlerId"))
            "unregisterEvent" ->
                NativeCommand.UnregisterEvent(id("id"), o.getString("eventName"), o.getString("handlerId"))
            else -> throw IllegalArgumentException("unknown command type $type")
        }
    }

    private fun decodeProp(value: Any?): NativeProp = when (value) {
        null, JSONObject.NULL -> NativeProp.Null
        is Boolean -> NativeProp.Bool(value)
        is Int -> NativeProp.Num(value.toDouble())
        is Long -> NativeProp.Num(value.toDouble())
        is Double -> NativeProp.Num(value)
        is String -> NativeProp.Str(value)
        is JSONArray -> NativeProp.Arr((0 until value.length()).map { decodeProp(value.get(it)) })
        is JSONObject -> NativeProp.Obj(value.keys().asSequence().associateWith { decodeProp(value.get(it)) })
        else -> NativeProp.Str(value.toString())
    }
}
