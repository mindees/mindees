/*
 * MindeesNativeHost.kt — applies a NativeCommand stream to a pluggable renderer,
 * with strict validation mirroring @mindees/renderer's reference host.
 *
 * The host owns identity + structure bookkeeping (and validates the stream); a
 * [HostRenderer] builds/mutates the actual views. Use [AndroidViewRenderer] on a
 * device, or [ModelRenderer] in JVM unit tests (`./gradlew test`, no device needed).
 *
 * CI-verified by the native Android workflow; see the module README.
 */

package dev.mindees.host

/** Thrown when a command stream violates the host contract. */
class NativeHostException(message: String) : RuntimeException(message)

/**
 * A pluggable platform renderer. The host calls these to materialize the UI.
 * [V] is the platform node type (`android.view.View`, or `ModelNode` in tests).
 */
interface HostRenderer<V> {
    fun makeElement(tag: String): V
    fun makeText(text: String): V
    fun setText(view: V, text: String)
    fun setProp(view: V, name: String, value: NativeProp)
    fun removeProp(view: V, name: String)
    fun insert(parent: V, child: V, index: Int)
    fun remove(parent: V, child: V)
    /** Wire a native event; the renderer calls [fire] when it occurs. */
    fun addEvent(view: V, eventName: String, handlerId: String, fire: () -> Unit)
    fun removeEvent(view: V, eventName: String, handlerId: String)
    /** Free a node's resources (already detached from its parent). */
    fun dispose(view: V)
}

/**
 * Applies a [NativeCommand] stream to a [HostRenderer], strictly validating it
 * (throws [NativeHostException] on any malformed/leaking sequence) — the contract
 * `@mindees/renderer`'s `createReferenceHost()` enforces and tests.
 *
 * @param onEvent invoked with a `handlerId` when a wired native event fires;
 *   forward it to the JS runtime's `backend.dispatchEvent(handlerId, event)`.
 */
class MindeesNativeHost<V>(
    private val rootId: String,
    root: V,
    private val renderer: HostRenderer<V>,
    private val onEvent: (handlerId: String) -> Unit,
) {
    private val views = HashMap<String, V>()
    private val parentOf = HashMap<String, String>()
    private val childrenOf = HashMap<String, MutableList<String>>()

    init {
        views[rootId] = root
        childrenOf[rootId] = mutableListOf()
    }

    /** Live (created, not yet disposed) node count, excluding the root. */
    val liveNodeCount: Int get() = views.size - 1

    fun apply(batch: List<NativeCommand>) {
        for (command in batch) apply(command)
    }

    fun apply(command: NativeCommand) {
        when (command) {
            is NativeCommand.CreateNode -> {
                requireAbsent(command.id)
                views[command.id] = renderer.makeElement(command.tag)
                childrenOf[command.id] = mutableListOf()
            }
            is NativeCommand.CreateText -> {
                requireAbsent(command.id)
                views[command.id] = renderer.makeText(command.text)
                childrenOf[command.id] = mutableListOf()
            }
            is NativeCommand.UpdateText -> renderer.setText(view(command.id), command.text)
            is NativeCommand.SetProp -> renderer.setProp(view(command.id), command.name, command.value)
            is NativeCommand.RemoveProp -> renderer.removeProp(view(command.id), command.name)
            is NativeCommand.InsertChild -> {
                if (parentOf.containsKey(command.childId)) {
                    throw NativeHostException("insertChild: ${command.childId} already has a parent")
                }
                val parent = view(command.parentId)
                val child = view(command.childId)
                val kids = childrenOf.getOrPut(command.parentId) { mutableListOf() }
                if (command.index < 0 || command.index > kids.size) {
                    throw NativeHostException("insertChild: index ${command.index} out of range")
                }
                kids.add(command.index, command.childId)
                parentOf[command.childId] = command.parentId
                renderer.insert(parent, child, command.index)
            }
            is NativeCommand.RemoveChild -> {
                val kids = childrenOf[command.parentId]
                if (parentOf[command.childId] != command.parentId || kids == null ||
                    !kids.remove(command.childId)
                ) {
                    throw NativeHostException("removeChild: ${command.childId} is not a child of ${command.parentId}")
                }
                parentOf.remove(command.childId)
                renderer.remove(view(command.parentId), view(command.childId))
            }
            is NativeCommand.DisposeNode -> {
                if (command.id == rootId) throw NativeHostException("cannot dispose the root node")
                val v = views[command.id] ?: throw NativeHostException("double dispose of ${command.id}")
                // Interior subtree nodes are freed without an explicit removeChild, so
                // detach from BOTH the bookkeeping and the renderer tree here. (A renderer
                // whose dispose() is a no-op — e.g. ModelRenderer — would otherwise leave
                // the node in its parent's children even though we consider it detached.)
                parentOf.remove(command.id)?.let { pid ->
                    childrenOf[pid]?.remove(command.id)
                    views[pid]?.let { parentView -> renderer.remove(parentView, v) }
                }
                renderer.dispose(v)
                views.remove(command.id)
                childrenOf.remove(command.id)
            }
            is NativeCommand.RegisterEvent -> {
                val target = view(command.id)
                val handlerId = command.handlerId
                renderer.addEvent(target, command.eventName, handlerId) { onEvent(handlerId) }
            }
            is NativeCommand.UnregisterEvent ->
                renderer.removeEvent(view(command.id), command.eventName, command.handlerId)
        }
    }

    private fun view(id: String): V = views[id] ?: throw NativeHostException("unknown node $id")

    private fun requireAbsent(id: String) {
        if (views.containsKey(id)) throw NativeHostException("duplicate node id $id")
    }
}

// --- In-memory renderer for JVM unit tests (no Android) ---

/** An in-memory model node the [ModelRenderer] builds. */
class ModelNode(val kind: String, var tag: String, var text: String) {
    val props = HashMap<String, NativeProp>()
    val events = HashMap<String, String>() // eventName -> handlerId
    val children = ArrayList<ModelNode>()

    /** A compact structural string (tags + text) for assertions. */
    fun serialize(): String =
        if (kind == "text") text
        else "<$tag>" + children.joinToString("") { it.serialize() } + "</$tag>"
}

/** A [HostRenderer] that builds a [ModelNode] tree — used by unit tests. */
class ModelRenderer : HostRenderer<ModelNode> {
    override fun makeElement(tag: String) = ModelNode("element", tag, "")
    override fun makeText(text: String) = ModelNode("text", "", text)
    override fun setText(view: ModelNode, text: String) { view.text = text }
    override fun setProp(view: ModelNode, name: String, value: NativeProp) { view.props[name] = value }
    override fun removeProp(view: ModelNode, name: String) { view.props.remove(name) }
    override fun insert(parent: ModelNode, child: ModelNode, index: Int) { parent.children.add(index, child) }
    override fun remove(parent: ModelNode, child: ModelNode) { parent.children.remove(child) }
    override fun addEvent(view: ModelNode, eventName: String, handlerId: String, fire: () -> Unit) {
        view.events[eventName] = handlerId
    }
    override fun removeEvent(view: ModelNode, eventName: String, handlerId: String) {
        view.events.remove(eventName)
    }
    override fun dispose(view: ModelNode) { view.children.clear() }
}
