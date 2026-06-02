//
//  MindeesNativeHost.swift
//
//  ⚠️ REFERENCE STUB — NOT A PRODUCTION HOST, NOT COMPILED IN CI.
//
//  This file illustrates how an iOS host would consume the MindeesNative
//  "native command protocol" emitted by `@mindees/renderer`'s
//  createNativeCommandBackend(). It is deliberately minimal: it maps commands to
//  UIKit views, stores nodes by id, and exposes an event callback. Props and
//  accessibility are placeholders. It does NOT yet render a real MindeesNative
//  app — that is Phase 8B.
//
//  Protocol source of truth: packages/renderer/src/native-protocol.ts
//

import UIKit

// MARK: - Decoded command model

/// A serializable prop value (mirrors `NativePropValue`).
enum NativePropValue: Decodable {
    case string(String), number(Double), bool(Bool), null
    case array([NativePropValue]), object([String: NativePropValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([NativePropValue].self) { self = .array(a) }
        else if let o = try? c.decode([String: NativePropValue].self) { self = .object(o) }
        else { self = .null }
    }
}

/// One native command (mirrors the `NativeCommand` union, decoded by `type`).
enum NativeCommand: Decodable {
    case createNode(id: String, tag: String)
    case createText(id: String, text: String)
    case setProp(id: String, name: String, value: NativePropValue)
    case removeProp(id: String, name: String)
    case insertChild(parentId: String, childId: String, index: Int)
    case removeChild(parentId: String, childId: String)
    case updateText(id: String, text: String)
    case disposeNode(id: String)
    case registerEvent(id: String, eventName: String, handlerId: String)
    case unregisterEvent(id: String, eventName: String, handlerId: String)

    private enum Key: String, CodingKey {
        case type, id, tag, text, name, value, parentId, childId, index, eventName, handlerId
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        // Node ids are string|number on the wire; this stub normalizes to String.
        func id(_ k: Key) throws -> String {
            if let s = try? c.decode(String.self, forKey: k) { return s }
            return String(try c.decode(Int.self, forKey: k))
        }
        switch try c.decode(String.self, forKey: .type) {
        case "createNode": self = .createNode(id: try id(.id), tag: try c.decode(String.self, forKey: .tag))
        case "createText": self = .createText(id: try id(.id), text: try c.decode(String.self, forKey: .text))
        case "setProp": self = .setProp(id: try id(.id), name: try c.decode(String.self, forKey: .name), value: try c.decode(NativePropValue.self, forKey: .value))
        case "removeProp": self = .removeProp(id: try id(.id), name: try c.decode(String.self, forKey: .name))
        case "insertChild": self = .insertChild(parentId: try id(.parentId), childId: try id(.childId), index: try c.decode(Int.self, forKey: .index))
        case "removeChild": self = .removeChild(parentId: try id(.parentId), childId: try id(.childId))
        case "updateText": self = .updateText(id: try id(.id), text: try c.decode(String.self, forKey: .text))
        case "disposeNode": self = .disposeNode(id: try id(.id))
        case "registerEvent": self = .registerEvent(id: try id(.id), eventName: try c.decode(String.self, forKey: .eventName), handlerId: try c.decode(String.self, forKey: .handlerId))
        case "unregisterEvent": self = .unregisterEvent(id: try id(.id), eventName: try c.decode(String.self, forKey: .eventName), handlerId: try c.decode(String.self, forKey: .handlerId))
        case let other: throw DecodingError.dataCorruptedError(forKey: .type, in: c, debugDescription: "unknown command type \(other)")
        }
    }
}

// MARK: - Host

/// Applies a `NativeCommand` stream to a UIKit view tree.
///
/// `onEvent(handlerId, payload)` should call back into the JS runtime's
/// `backend.dispatchEvent(handlerId, payload)`; wiring that bridge is out of
/// scope for this stub.
final class MindeesNativeHost {
    private var nodes: [String: UIView] = [:]
    /// node id → (eventName → handlerId), so a tap can resolve its handler.
    private var handlers: [String: [String: String]] = [:]
    private let onEvent: (_ handlerId: String, _ payload: [String: Any]) -> Void

    init(root: UIView, rootId: String, onEvent: @escaping (String, [String: Any]) -> Void) {
        self.onEvent = onEvent
        nodes[rootId] = root // the host's pre-existing root container
    }

    /// Apply a decoded batch (e.g. from `JSONDecoder().decode([NativeCommand].self, from:)`).
    func apply(_ batch: [NativeCommand]) { batch.forEach(apply) }

    func apply(_ command: NativeCommand) {
        switch command {
        case let .createNode(id, tag):
            nodes[id] = makeView(tag: tag)
        case let .createText(id, text):
            let label = UILabel(); label.text = text; nodes[id] = label
        case let .updateText(id, text):
            (nodes[id] as? UILabel)?.text = text
        case let .setProp(id, name, value):
            applyProp(nodes[id], name: name, value: value) // TODO(8B): real style/accessibility mapping
        case let .removeProp(id, name):
            applyProp(nodes[id], name: name, value: .null)
        case let .insertChild(parentId, childId, index):
            guard let parent = nodes[parentId], let child = nodes[childId] else { return }
            parent.insertSubview(child, at: min(index, parent.subviews.count))
        case let .removeChild(_, childId):
            nodes[childId]?.removeFromSuperview()
        case let .disposeNode(id):
            nodes[id]?.removeFromSuperview()
            nodes[id] = nil
            handlers[id] = nil
        case let .registerEvent(id, eventName, handlerId):
            register(nodeId: id, eventName: eventName, handlerId: handlerId)
        case let .unregisterEvent(id, eventName, _):
            handlers[id]?[eventName] = nil
            if eventName == "press", let view = nodes[id],
               let tap = objc_getAssociatedObject(view, &TapForwarder.key) as? TapForwarder {
                view.removeGestureRecognizer(tap.recognizer)
                objc_setAssociatedObject(view, &TapForwarder.key, nil, .OBJC_ASSOCIATION_RETAIN)
            }
        }
    }

    // MARK: mapping helpers (placeholders — Phase 8B fills these in)

    private func makeView(tag: String) -> UIView {
        switch tag {
        case "text": return UILabel()
        case "button": return UIButton(type: .system)
        default: return UIView() // view, scrollview, … → container placeholders for now
        }
    }

    private func applyProp(_ view: UIView?, name: String, value: NativePropValue) {
        // Reference only: a real host maps e.g. accessibilityLabel, background,
        // layout props, etc. Here we just demonstrate one mapping.
        guard let view else { return }
        if name == "accessibilityLabel", case let .string(s) = value { view.accessibilityLabel = s }
    }

    private func register(nodeId: String, eventName: String, handlerId: String) {
        guard let view = nodes[nodeId], eventName == "press" else { return }
        handlers[nodeId, default: [:]][eventName] = handlerId
        view.isUserInteractionEnabled = true
        // Replace any prior recognizer so repeated registrations don't stack up.
        if let old = objc_getAssociatedObject(view, &TapForwarder.key) as? TapForwarder {
            view.removeGestureRecognizer(old.recognizer)
        }
        let tap = TapForwarder { [weak self] in self?.onEvent(handlerId, [:]) }
        view.addGestureRecognizer(tap.recognizer)
        objc_setAssociatedObject(view, &TapForwarder.key, tap, .OBJC_ASSOCIATION_RETAIN)
    }
}

/// Tiny helper so a closure can back a UITapGestureRecognizer (reference only).
private final class TapForwarder {
    static var key = 0
    let recognizer: UITapGestureRecognizer
    private let action: () -> Void
    init(_ action: @escaping () -> Void) {
        self.action = action
        self.recognizer = UITapGestureRecognizer()
        self.recognizer.addTarget(self, action: #selector(fire))
    }
    @objc private func fire() { action() }
}
