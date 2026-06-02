//
//  MindeesNativeHost.swift — applies a NativeCommand stream to a pluggable renderer,
//  with strict validation that mirrors @mindees/renderer's reference host.
//
//  The host owns identity + structure bookkeeping (and validates the stream); a
//  `HostRenderer` builds/mutates the actual platform views. Use `UIKitRenderer` on a
//  device, or `ModelRenderer` in tests (no UIKit needed → `swift test` runs anywhere).
//
//  ⚠️ Authored, not yet compiled by the maintainers — see Package.swift.
//

import Foundation

/// Errors thrown when a command stream violates the host contract.
public enum NativeHostError: Error, Equatable {
    case duplicateId(String)
    case unknownNode(String)
    case notAChild(String)
    case doubleDispose(String)
    case indexOutOfRange(Int)
    case alreadyAttached(String)
    case cannotDisposeRoot
}

/// A pluggable platform renderer. The host calls these to materialize the UI.
/// `View` is the platform node type (`UIView` for UIKit, `ModelNode` for tests).
public protocol HostRenderer: AnyObject {
    associatedtype View
    func makeElement(_ tag: String) -> View
    func makeText(_ text: String) -> View
    func setText(_ view: View, _ text: String)
    func setProp(_ view: View, _ name: String, _ value: NativePropValue)
    func removeProp(_ view: View, _ name: String)
    func insert(parent: View, child: View, index: Int)
    func remove(parent: View, child: View)
    /// Wire a native event. The renderer must call `fire()` when the event occurs.
    func addEvent(_ view: View, eventName: String, handlerId: String, fire: @escaping () -> Void)
    func removeEvent(_ view: View, eventName: String, handlerId: String)
    /// Free a node's resources (it has already been detached from its parent).
    func dispose(_ view: View)
}

/// Applies a `NativeCommand` stream to a `HostRenderer`. Strictly validates the
/// stream: throws `NativeHostError` on any malformed/leaking sequence — the same
/// contract `@mindees/renderer`'s `createReferenceHost()` enforces and tests.
public final class MindeesNativeHost<R: HostRenderer> {
    private let renderer: R
    /// Called when a wired native event fires, with its `handlerId`. Forward this to
    /// the JS runtime's `backend.dispatchEvent(handlerId, event)` over your bridge.
    private let onEvent: (_ handlerId: String) -> Void

    private let rootId: String
    private var views: [String: R.View] = [:]
    private var parentOf: [String: String] = [:]
    private var childrenOf: [String: [String]] = [:]

    public init(rootId: String, root: R.View, renderer: R, onEvent: @escaping (String) -> Void) {
        self.rootId = rootId
        self.renderer = renderer
        self.onEvent = onEvent
        views[rootId] = root
        childrenOf[rootId] = []
    }

    /// Apply a decoded batch in order.
    public func apply(_ batch: [NativeCommand]) throws {
        for command in batch { try apply(command) }
    }

    public func apply(_ command: NativeCommand) throws {
        switch command {
        case let .createNode(id, tag):
            try requireAbsent(id.raw)
            views[id.raw] = renderer.makeElement(tag)
            childrenOf[id.raw] = []

        case let .createText(id, text):
            try requireAbsent(id.raw)
            views[id.raw] = renderer.makeText(text)
            childrenOf[id.raw] = []

        case let .updateText(id, text):
            renderer.setText(try view(id.raw), text)

        case let .setProp(id, name, value):
            renderer.setProp(try view(id.raw), name, value)

        case let .removeProp(id, name):
            renderer.removeProp(try view(id.raw), name)

        case let .insertChild(parentId, childId, index):
            if parentOf[childId.raw] != nil { throw NativeHostError.alreadyAttached(childId.raw) }
            let parent = try view(parentId.raw)
            let child = try view(childId.raw)
            var kids = childrenOf[parentId.raw] ?? []
            guard index >= 0, index <= kids.count else { throw NativeHostError.indexOutOfRange(index) }
            kids.insert(childId.raw, at: index)
            childrenOf[parentId.raw] = kids
            parentOf[childId.raw] = parentId.raw
            renderer.insert(parent: parent, child: child, index: index)

        case let .removeChild(parentId, childId):
            guard parentOf[childId.raw] == parentId.raw,
                  var kids = childrenOf[parentId.raw],
                  let at = kids.firstIndex(of: childId.raw)
            else { throw NativeHostError.notAChild(childId.raw) }
            kids.remove(at: at)
            childrenOf[parentId.raw] = kids
            parentOf[childId.raw] = nil
            renderer.remove(parent: try view(parentId.raw), child: try view(childId.raw))

        case let .disposeNode(id):
            if id.raw == rootId { throw NativeHostError.cannotDisposeRoot }
            guard let v = views[id.raw] else { throw NativeHostError.doubleDispose(id.raw) }
            // Interior subtree nodes are freed without an explicit removeChild, so
            // detach from BOTH the bookkeeping and the renderer tree here. (A renderer
            // whose dispose() is a no-op — e.g. ModelRenderer — would otherwise leave
            // the node in its parent's children even though we consider it detached.)
            if let pid = parentOf[id.raw] {
                if var kids = childrenOf[pid], let at = kids.firstIndex(of: id.raw) {
                    kids.remove(at: at)
                    childrenOf[pid] = kids
                }
                parentOf[id.raw] = nil
                if let parentView = views[pid] {
                    renderer.remove(parent: parentView, child: v)
                }
            }
            renderer.dispose(v)
            views[id.raw] = nil
            childrenOf[id.raw] = nil

        case let .registerEvent(id, eventName, handlerId):
            let target = try view(id.raw)
            renderer.addEvent(target, eventName: eventName, handlerId: handlerId) { [weak self] in
                self?.onEvent(handlerId)
            }

        case let .unregisterEvent(id, eventName, handlerId):
            renderer.removeEvent(try view(id.raw), eventName: eventName, handlerId: handlerId)
        }
    }

    /// Live (created, not yet disposed) node count, excluding the root.
    public var liveNodeCount: Int { views.count - 1 }

    private func view(_ id: String) throws -> R.View {
        guard let v = views[id] else { throw NativeHostError.unknownNode(id) }
        return v
    }

    private func requireAbsent(_ id: String) throws {
        if views[id] != nil { throw NativeHostError.duplicateId(id) }
    }
}
