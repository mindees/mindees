//
//  UIKitRenderer.swift — a HostRenderer that builds real UIKit views.
//
//  This is the device-facing layer (the part that needs a simulator/device to run).
//  It is conditionally compiled, so the package still builds + `swift test`s on
//  platforms without UIKit. It maps Atlas's curated cross-platform `StyleObject` onto
//  UIStackView/Auto Layout (the iOS analogue of the Android FlexboxLayout renderer):
//  flexDirection/alignItems/justifyContent(subset)/gap, the box model, visuals, and
//  text styling. Honest v1 gaps (deferred): flex-wrap, space-around/evenly + per-child
//  alignSelf, flexGrow, TextInput, image src — see README.
//
//  CI-verified by the native iOS workflow's iOS-Simulator `xcodebuild test` step
//  (the macOS `swift test` step excludes UIKit and only covers the ModelRenderer core).
//

#if canImport(UIKit)
import UIKit

/// Maps MindeesNative semantic tags to UIKit views and applies the command stream.
public final class UIKitRenderer: HostRenderer {
    public typealias View = UIView

    public init() {}

    // Side state — the iOS twins of the Android renderer's per-view HashMaps (the command
    // stream hands us only raw UIViews, so layout intent that can't live on the view lives here).
    /// A scrollview node's inner content UIStackView (children + flex styles route into it).
    private var scrollContent: [ObjectIdentifier: UIStackView] = [:]
    /// Explicit size constraints per view+key, so re-applying width/height replaces (never stacks).
    private var sizeConstraints: [ObjectIdentifier: [String: NSLayoutConstraint]] = [:]

    /// The flex container to configure for a node: itself, or a scrollview's inner content stack.
    private func contentFor(_ view: UIView) -> UIView { scrollContent[ObjectIdentifier(view)] ?? view }

    // MARK: - Node creation

    public func makeElement(_ tag: String) -> UIView {
        switch tag {
        case "text":
            return UILabel()
        case "button":
            return UIButton(type: .system)
        case "image":
            return UIImageView()
        case "textinput":
            return UITextField() // styling deferred; at least not a stack
        case "scrollview":
            return makeScrollHost(axis: .vertical)
        case "horizontalscrollview":
            return makeScrollHost(axis: .horizontal)
        default:
            // view / unknown tags → a flex container (default column, mirroring Android).
            let stack = UIStackView()
            stack.axis = .vertical
            return stack
        }
    }

    /// A UIScrollView whose single child is a content UIStackView pinned to scroll the given axis.
    private func makeScrollHost(axis: NSLayoutConstraint.Axis) -> UIScrollView {
        let scroll = UIScrollView()
        let content = UIStackView()
        content.axis = axis
        content.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(content)
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            content.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
            content.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
        ])
        // Match the cross axis to the viewport so the content scrolls only along `axis`.
        if axis == .vertical {
            content.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor).isActive = true
        } else {
            content.heightAnchor.constraint(equalTo: scroll.frameLayoutGuide.heightAnchor).isActive = true
        }
        scrollContent[ObjectIdentifier(scroll)] = content
        return scroll
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

    // MARK: - Props

    public func setProp(_ view: UIView, _ name: String, _ value: NativePropValue) {
        switch name {
        case "style":
            if case let .object(map) = value { applyStyle(view, map) }
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
            break // unmapped props are ignored
        }
    }

    public func removeProp(_ view: UIView, _ name: String) {
        switch name {
        case "accessibilityLabel": view.accessibilityLabel = nil
        case "hidden": view.isHidden = false
        default: break
        }
    }

    // MARK: - Tree structure

    public func insert(parent: UIView, child: UIView, index: Int) {
        let target = contentFor(parent) // route scrollview children into the content stack
        if let stack = target as? UIStackView {
            let clamped = max(0, min(index, stack.arrangedSubviews.count))
            stack.insertArrangedSubview(child, at: clamped)
        } else {
            let clamped = max(0, min(index, target.subviews.count))
            target.insertSubview(child, at: clamped)
        }
    }

    public func remove(parent: UIView, child: UIView) {
        if child.superview != nil { child.removeFromSuperview() } // also leaves arrangedSubviews
    }

    public func dispose(_ view: UIView) {
        view.removeFromSuperview()
        let id = ObjectIdentifier(view)
        scrollContent.removeValue(forKey: id)
        sizeConstraints.removeValue(forKey: id)
    }

    // MARK: - Events (tap/press + click)

    public func addEvent(_ view: UIView, eventName: String, handlerId: String, fire: @escaping () -> Void) {
        guard eventName == "press" || eventName == "click" else { return }
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
        if let existing = objc_getAssociatedObject(view, &TapForwarder.assocKey) as? TapForwarder {
            view.removeGestureRecognizer(existing.recognizer)
        }
        let forwarder = TapForwarder(fire)
        view.addGestureRecognizer(forwarder.recognizer)
        objc_setAssociatedObject(view, &TapForwarder.assocKey, forwarder, .OBJC_ASSOCIATION_RETAIN)
    }

    public func removeEvent(_ view: UIView, eventName: String, handlerId: String) {
        guard eventName == "press" || eventName == "click" else { return }
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

    // MARK: - Style application

    private func applyStyle(_ view: UIView, _ s: [String: NativePropValue]) {
        let flex = contentFor(view) as? UIStackView

        // Flex container: direction first (so alignItems can read the resolved axis), then align/justify/gap.
        if case let .string(dir)? = s["flexDirection"] {
            flex?.axis = dir.hasPrefix("row") ? .horizontal : .vertical
        }
        if case let .string(align)? = s["alignItems"], let stack = flex {
            stack.alignment = alignmentFor(align, axis: stack.axis)
        }
        if case let .string(justify)? = s["justifyContent"] {
            // v1: space-between → equalSpacing; everything else → fill (center/flex-end/space-* deferred).
            flex?.distribution = justify == "space-between" ? .equalSpacing : .fill
        }
        if let gap = number(s["gap"]) ?? number(s["rowGap"]) ?? number(s["columnGap"]) {
            flex?.spacing = CGFloat(gap)
        }
        applyPadding(flex, s)

        // Box model (explicit numeric sizes only in v1; '100%'/'auto' deferred → intrinsic/alignment).
        if let w = number(s["width"]) { setSize(view, "width", view.widthAnchor.constraint(equalToConstant: CGFloat(w))) }
        if let h = number(s["height"]) { setSize(view, "height", view.heightAnchor.constraint(equalToConstant: CGFloat(h))) }
        if let mw = number(s["minWidth"]) {
            setSize(view, "minWidth", view.widthAnchor.constraint(greaterThanOrEqualToConstant: CGFloat(mw)))
        }
        if let mh = number(s["minHeight"]) {
            setSize(view, "minHeight", view.heightAnchor.constraint(greaterThanOrEqualToConstant: CGFloat(mh)))
        }

        // Visuals.
        if let bg = colorValue(s["backgroundColor"]) { view.backgroundColor = bg }
        if let r = number(s["borderRadius"]) {
            view.layer.cornerRadius = CGFloat(r)
            view.clipsToBounds = true
        }
        if let bw = number(s["borderWidth"]) { view.layer.borderWidth = CGFloat(bw) }
        if let bc = colorValue(s["borderColor"]) { view.layer.borderColor = bc.cgColor }
        if let op = number(s["opacity"]) { view.alpha = CGFloat(op) }
        if let e = number(s["elevation"]), e > 0 {
            view.layer.shadowColor = UIColor.black.cgColor
            view.layer.shadowOpacity = 0.2
            view.layer.shadowRadius = CGFloat(e)
            view.layer.shadowOffset = CGSize(width: 0, height: CGFloat(e) / 2)
        }

        // Text.
        if let label = view as? UILabel { applyText(label, s) }
        if let button = view as? UIButton, let label = button.titleLabel {
            applyText(label, s)
            if let c = colorValue(s["color"]) { button.setTitleColor(c, for: .normal) }
        }
    }

    private func applyPadding(_ stack: UIStackView?, _ s: [String: NativePropValue]) {
        guard let stack = stack else { return }
        let all = number(s["padding"])
        let l = number(s["paddingLeft"]) ?? all
        let t = number(s["paddingTop"]) ?? all
        let r = number(s["paddingRight"]) ?? all
        let b = number(s["paddingBottom"]) ?? all
        if l == nil && t == nil && r == nil && b == nil { return }
        stack.isLayoutMarginsRelativeArrangement = true
        let cur = stack.directionalLayoutMargins
        stack.directionalLayoutMargins = NSDirectionalEdgeInsets(
            top: CGFloat(t ?? Double(cur.top)),
            leading: CGFloat(l ?? Double(cur.leading)),
            bottom: CGFloat(b ?? Double(cur.bottom)),
            trailing: CGFloat(r ?? Double(cur.trailing))
        )
    }

    private func applyText(_ label: UILabel, _ s: [String: NativePropValue]) {
        if let c = colorValue(s["color"]) { label.textColor = c }
        let size = number(s["fontSize"]).map { CGFloat($0) } ?? label.font.pointSize
        var bold = false
        if case let .number(w)? = s["fontWeight"] { bold = w >= 600 }
        if case let .string(w)? = s["fontWeight"] { bold = (w == "bold" || (Int(w) ?? 0) >= 600) }
        if s["fontSize"] != nil || s["fontWeight"] != nil {
            label.font = bold ? UIFont.boldSystemFont(ofSize: size) : UIFont.systemFont(ofSize: size)
        }
        if case let .string(align)? = s["textAlign"] { label.textAlignment = textAlignment(align) }
        if let n = number(s["numberOfLines"]) {
            label.numberOfLines = Int(n)
            if Int(n) > 0 { label.lineBreakMode = .byTruncatingTail }
        }
    }

    // MARK: - Mapping helpers

    /// Replace any prior size constraint for `key` on `view` (never stack duplicates → no conflicts).
    private func setSize(_ view: UIView, _ key: String, _ constraint: NSLayoutConstraint) {
        let id = ObjectIdentifier(view)
        var byKey = sizeConstraints[id] ?? [:]
        byKey[key]?.isActive = false
        constraint.isActive = true
        byKey[key] = constraint
        sizeConstraints[id] = byKey
    }

    private func alignmentFor(_ align: String, axis: NSLayoutConstraint.Axis) -> UIStackView.Alignment {
        switch align {
        case "center": return .center
        case "stretch": return .fill
        case "baseline": return .firstBaseline
        case "flex-end", "end": return axis == .horizontal ? .bottom : .trailing
        case "flex-start", "start": return axis == .horizontal ? .top : .leading
        default: return .fill // flex default alignItems is stretch
        }
    }

    private func textAlignment(_ align: String) -> NSTextAlignment {
        switch align {
        case "center": return .center
        case "right": return .right
        case "justify": return .justified
        case "left": return .left
        default: return .natural
        }
    }

    private func number(_ value: NativePropValue?) -> Double? {
        if case let .number(n)? = value { return n }
        return nil
    }

    private func colorValue(_ value: NativePropValue?) -> UIColor? {
        if case let .string(s)? = value { return parseColor(s) }
        return nil
    }

    /// Parse `#rgb` / `#rrggbb` / `#rrggbbaa` (+ a few named) → UIColor; nil if unparseable.
    private func parseColor(_ raw: String) -> UIColor? {
        var hex = raw.trimmingCharacters(in: .whitespaces)
        guard hex.hasPrefix("#") else {
            switch hex.lowercased() {
            case "transparent": return .clear
            case "white": return .white
            case "black": return .black
            default: return nil
            }
        }
        hex.removeFirst()
        if hex.count == 3 { hex = hex.map { "\($0)\($0)" }.joined() }
        guard let value = UInt64(hex, radix: 16) else { return nil }
        switch hex.count {
        case 8:
            return UIColor(
                red: CGFloat((value >> 24) & 0xff) / 255,
                green: CGFloat((value >> 16) & 0xff) / 255,
                blue: CGFloat((value >> 8) & 0xff) / 255,
                alpha: CGFloat(value & 0xff) / 255
            )
        case 6:
            return UIColor(
                red: CGFloat((value >> 16) & 0xff) / 255,
                green: CGFloat((value >> 8) & 0xff) / 255,
                blue: CGFloat(value & 0xff) / 255,
                alpha: 1
            )
        default:
            return nil
        }
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

/// Bridges a UIControl touch-up event to the same `press`/`click` callback.
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
