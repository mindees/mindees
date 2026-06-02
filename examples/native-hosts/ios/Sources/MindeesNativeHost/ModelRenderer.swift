//
//  ModelRenderer.swift — an in-memory HostRenderer for tests (no UIKit).
//
//  Lets `MindeesNativeHost` be exercised with `swift test` on any platform — no
//  simulator/device needed. It is the Swift twin of the TS reference host's model.
//
//  ⚠️ Authored, not yet compiled by the maintainers — see Package.swift.
//

import Foundation

/// An in-memory model node the `ModelRenderer` builds.
public final class ModelNode {
    public let kind: String // "element" | "text"
    public var tag: String
    public var text: String
    public var props: [String: NativePropValue] = [:]
    public var events: [String: String] = [:] // eventName -> handlerId
    public private(set) var children: [ModelNode] = []

    public init(kind: String, tag: String, text: String) {
        self.kind = kind
        self.tag = tag
        self.text = text
    }

    func insert(_ child: ModelNode, at index: Int) { children.insert(child, at: index) }
    func remove(_ child: ModelNode) { children.removeAll { $0 === child } }

    /// A compact structural string (tags + text) for assertions.
    public func serialize() -> String {
        if kind == "text" { return text }
        return "<\(tag)>" + children.map { $0.serialize() }.joined() + "</\(tag)>"
    }
}

/// A `HostRenderer` that builds a `ModelNode` tree in memory.
public final class ModelRenderer: HostRenderer {
    public typealias View = ModelNode

    public init() {}

    public func makeElement(_ tag: String) -> ModelNode { ModelNode(kind: "element", tag: tag, text: "") }
    public func makeText(_ text: String) -> ModelNode { ModelNode(kind: "text", tag: "", text: text) }
    public func setText(_ view: ModelNode, _ text: String) { view.text = text }
    public func setProp(_ view: ModelNode, _ name: String, _ value: NativePropValue) { view.props[name] = value }
    public func removeProp(_ view: ModelNode, _ name: String) { view.props[name] = nil }
    public func insert(parent: ModelNode, child: ModelNode, index: Int) { parent.insert(child, at: index) }
    public func remove(parent: ModelNode, child: ModelNode) { parent.remove(child) }
    public func addEvent(_ view: ModelNode, eventName: String, handlerId: String, fire: @escaping () -> Void) {
        view.events[eventName] = handlerId
    }
    public func removeEvent(_ view: ModelNode, eventName: String, handlerId: String) {
        view.events[eventName] = nil
    }
    public func dispose(_ view: ModelNode) { /* model nodes are GC'd; nothing to free */ }
}
