//
//  UIKitRenderer.swift — a HostRenderer that builds real UIKit views.
//
//  This is the device-facing layer (the part that needs a simulator/device to run).
//  It is conditionally compiled, so the package still builds + `swift test`s on
//  platforms without UIKit. Tag mapping + prop application are intentionally minimal
//  (an MVP) — extend `applyProp` / `makeElement` for your design system.
//
//  CI-verified by the native iOS workflow.
//

#if canImport(UIKit)
import UIKit

/// Maps MindeesNative semantic tags to UIKit views and applies the command stream.
public final class UIKitRenderer: HostRenderer {
    public typealias View = UIView

    public init() {}

    public func makeElement(_ tag: String) -> UIView {
        switch tag {
        case "text":
            return UILabel()
        case "button":
            return UIButton(type: .system)
        case "image":
            return UIImageView()
        case "scrollview":
            return UIScrollView()
        default:
            // view / unknown tags → a plain container with a vertical stack default.
            return UIView()
        }
    }

    public func makeText(_ text: String) -> UIView {
        let label = UILabel()
        label.text = text
        label.numberOfLines = 0
        return label
    }

    public func setText(_ view: UIView, _ text: String) {
        (view as? UILabel)?.text = text
    }

    public func setProp(_ view: UIView, _ name: String, _ value: NativePropValue) {
        // Minimal reference mapping — extend for a real design system.
        switch name {
        case "accessibilityLabel":
            if case let .string(s) = value { view.accessibilityLabel = s }
        case "title":
            if case let .string(s) = value {
                (view as? UIButton)?.setTitle(s, for: .normal)
                (view as? UILabel)?.text = s
            }
        case "hidden":
            if case let .bool(b) = value { view.isHidden = b }
        default:
            break // unmapped props are ignored in this MVP
        }
    }

    public func removeProp(_ view: UIView, _ name: String) {
        switch name {
        case "accessibilityLabel": view.accessibilityLabel = nil
        case "hidden": view.isHidden = false
        default: break
        }
    }

    public func insert(parent: UIView, child: UIView, index: Int) {
        let clamped = max(0, min(index, parent.subviews.count))
        parent.insertSubview(child, at: clamped)
    }

    public func remove(parent: UIView, child: UIView) {
        if child.superview === parent { child.removeFromSuperview() }
    }

    public func addEvent(_ view: UIView, eventName: String, handlerId: String, fire: @escaping () -> Void) {
        guard eventName == "press" else { return } // MVP: only tap/press
        view.isUserInteractionEnabled = true
        if let control = view as? UIControl {
            if let existing = objc_getAssociatedObject(control, &ControlForwarder.assocKey) as? ControlForwarder {
                control.removeTarget(existing, action: #selector(ControlForwarder.handlePress), for: .touchUpInside)
            }
            let forwarder = ControlForwarder(fire)
            control.addTarget(forwarder, action: #selector(ControlForwarder.handlePress), for: .touchUpInside)
            objc_setAssociatedObject(control, &ControlForwarder.assocKey, forwarder, .OBJC_ASSOCIATION_RETAIN)
            return
        }
        // Replace any prior recognizer so repeated registrations don't stack.
        if let existing = objc_getAssociatedObject(view, &TapForwarder.assocKey) as? TapForwarder {
            view.removeGestureRecognizer(existing.recognizer)
        }
        let forwarder = TapForwarder(fire)
        view.addGestureRecognizer(forwarder.recognizer)
        objc_setAssociatedObject(view, &TapForwarder.assocKey, forwarder, .OBJC_ASSOCIATION_RETAIN)
    }

    public func removeEvent(_ view: UIView, eventName: String, handlerId: String) {
        guard eventName == "press" else { return }
        if let control = view as? UIControl,
           let existing = objc_getAssociatedObject(control, &ControlForwarder.assocKey) as? ControlForwarder {
            control.removeTarget(existing, action: #selector(ControlForwarder.handlePress), for: .touchUpInside)
            objc_setAssociatedObject(control, &ControlForwarder.assocKey, nil, .OBJC_ASSOCIATION_RETAIN)
            return
        }
        if let existing = objc_getAssociatedObject(view, &TapForwarder.assocKey) as? TapForwarder {
            view.removeGestureRecognizer(existing.recognizer)
            objc_setAssociatedObject(view, &TapForwarder.assocKey, nil, .OBJC_ASSOCIATION_RETAIN)
        }
    }

    public func dispose(_ view: UIView) {
        view.removeFromSuperview()
    }
}

/// Bridges a closure to a `UITapGestureRecognizer`.
private final class TapForwarder {
    static var assocKey: UInt8 = 0
    let recognizer: UITapGestureRecognizer
    private let fire: () -> Void

    init(_ fire: @escaping () -> Void) {
        self.fire = fire
        self.recognizer = UITapGestureRecognizer()
        self.recognizer.addTarget(self, action: #selector(handleTap))
    }

    @objc private func handleTap() { fire() }
}

/// Bridges a UIControl touch-up event to the same `press` callback.
private final class ControlForwarder: NSObject {
    static var assocKey: UInt8 = 0
    private let fire: () -> Void

    init(_ fire: @escaping () -> Void) {
        self.fire = fire
        super.init()
    }

    @objc func handlePress() { fire() }
}
#endif
