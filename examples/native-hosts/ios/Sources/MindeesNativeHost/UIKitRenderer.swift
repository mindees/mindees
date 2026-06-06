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
    /// Text composition (iOS twin of Android's textParts/textOwner): a `text` ELEMENT (UILabel) can't
    /// hold child views, so its text-NODE children compose into its `.text` instead of nesting labels.
    private var textParts: [ObjectIdentifier: [UIView]] = [:]
    private var textOwner: [ObjectIdentifier: UIView] = [:]

    /// The flex container to configure for a node: itself, or a scrollview's inner content stack.
    private func contentFor(_ view: UIView) -> UIView { scrollContent[ObjectIdentifier(view)] ?? view }

    private func recomposeText(_ element: UIView) {
        guard let label = element as? UILabel, let parts = textParts[ObjectIdentifier(element)] else { return }
        label.text = parts.map { ($0 as? UILabel)?.text ?? "" }.joined()
    }

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
        // If this text node composes into a parent text element, re-compose the parent.
        if let owner = textOwner[ObjectIdentifier(view)] { recomposeText(owner) }
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
        // Image source (data:/base64 + bundled asset decode synchronously; remote is a follow-up).
        case "src", "source":
            if let image = view as? UIImageView { applyImageSource(image, value) }
        case "resizeMode":
            if let image = view as? UIImageView, case let .string(m) = value { image.contentMode = contentMode(m) }
        case "tintColor":
            if let image = view as? UIImageView, let c = colorValue(value) {
                image.image = image.image?.withRenderingMode(.alwaysTemplate)
                image.tintColor = c
            }
        // TextInput (UITextField; multiline/UITextView deferred).
        case "placeholder":
            if let field = view as? UITextField, case let .string(s) = value { field.placeholder = s }
        case "value":
            if let field = view as? UITextField, case let .string(s) = value, field.text != s { field.text = s }
        case "keyboardType", "inputMode", "type":
            if let field = view as? UITextField, case let .string(s) = value {
                if s == "password" { field.isSecureTextEntry = true } else { field.keyboardType = keyboardType(s) }
            }
        case "secureTextEntry":
            if let field = view as? UITextField, case let .bool(b) = value { field.isSecureTextEntry = b }
        case "editable":
            if let field = view as? UITextField, case let .bool(b) = value { field.isEnabled = b }
        case "disabled":
            if let field = view as? UITextField, case let .bool(b) = value { field.isEnabled = !b }
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
        } else if let label = target as? UILabel {
            // A text ELEMENT (UILabel leaf): compose text-node children into its text, don't nest views.
            let id = ObjectIdentifier(label)
            var parts = textParts[id] ?? []
            parts.insert(child, at: max(0, min(index, parts.count)))
            textParts[id] = parts
            textOwner[ObjectIdentifier(child)] = label
            recomposeText(label)
        } else {
            let clamped = max(0, min(index, target.subviews.count))
            target.insertSubview(child, at: clamped)
        }
    }

    public func remove(parent: UIView, child: UIView) {
        let childId = ObjectIdentifier(child)
        if let owner = textOwner.removeValue(forKey: childId) {
            textParts[ObjectIdentifier(owner)]?.removeAll { $0 === child }
            recomposeText(owner)
            return
        }
        if child.superview != nil { child.removeFromSuperview() } // also leaves arrangedSubviews
    }

    public func dispose(_ view: UIView) {
        view.removeFromSuperview()
        let id = ObjectIdentifier(view)
        scrollContent.removeValue(forKey: id)
        sizeConstraints.removeValue(forKey: id)
        // (Edit forwarders are associated objects on the field — auto-released when it deallocates.)
        // Detach from any text composition it participated in (as node or as owner).
        if let owner = textOwner.removeValue(forKey: id) {
            textParts[ObjectIdentifier(owner)]?.removeAll { $0 === view }
            recomposeText(owner)
        }
        textParts.removeValue(forKey: id)
    }

    // MARK: - Events (tap/press + click)

    public func addEvent(_ view: UIView, eventName: String, handlerId: String, fire: @escaping (_ value: String?) -> Void) {
        switch eventName {
        case "press", "click":
            view.isUserInteractionEnabled = true
            // Press/click are notify-only → fire(nil). The forwarders stay () -> Void; we adapt here.
            if let control = view as? UIControl {
                if let existing = objc_getAssociatedObject(control, &ControlForwarder.assocKey) as? ControlForwarder {
                    control.removeTarget(existing, action: #selector(ControlForwarder.handlePress), for: .touchUpInside)
                }
                let forwarder = ControlForwarder { fire(nil) }
                control.addTarget(forwarder, action: #selector(ControlForwarder.handlePress), for: .touchUpInside)
                objc_setAssociatedObject(control, &ControlForwarder.assocKey, forwarder, .OBJC_ASSOCIATION_RETAIN)
                return
            }
            if let existing = objc_getAssociatedObject(view, &TapForwarder.assocKey) as? TapForwarder {
                view.removeGestureRecognizer(existing.recognizer)
            }
            let forwarder = TapForwarder { fire(nil) }
            view.addGestureRecognizer(forwarder.recognizer)
            objc_setAssociatedObject(view, &TapForwarder.assocKey, forwarder, .OBJC_ASSOCIATION_RETAIN)
        // Text change (Atlas onInput→"input", onChange→"change"): fire the field's current text, which
        // the JS host wraps as { target: { value } } so onInput/onChange receive it.
        case "input", "change":
            guard let field = view as? UITextField else { return }
            // Retain the forwarder via an associated object on the FIELD (the same proven mechanism as
            // ControlForwarder), keyed per-event so input + change stay independent.
            let store = (objc_getAssociatedObject(field, &EditForwarder.assocKey) as? NSMutableDictionary)
                ?? NSMutableDictionary()
            if let existing = store[eventName] as? EditForwarder {
                field.removeTarget(existing, action: #selector(EditForwarder.handleChange), for: .editingChanged)
            }
            let forwarder = EditForwarder { [weak field] in fire(field?.text ?? "") }
            field.addTarget(forwarder, action: #selector(EditForwarder.handleChange), for: .editingChanged)
            store[eventName] = forwarder
            objc_setAssociatedObject(field, &EditForwarder.assocKey, store, .OBJC_ASSOCIATION_RETAIN)
        default:
            return
        }
    }

    public func removeEvent(_ view: UIView, eventName: String, handlerId: String) {
        switch eventName {
        case "press", "click":
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
        case "input", "change":
            guard let field = view as? UITextField,
                  let store = objc_getAssociatedObject(field, &EditForwarder.assocKey) as? NSMutableDictionary,
                  let existing = store[eventName] as? EditForwarder else { return }
            field.removeTarget(existing, action: #selector(EditForwarder.handleChange), for: .editingChanged)
            store.removeObject(forKey: eventName)
        default:
            return
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
        // An explicit width/height on an arranged subview must yield to a `.fill` stack's REQUIRED
        // cross-axis stretch (else the pair is unsatisfiable). .defaultHigh (999) still beats
        // hugging/compression so the explicit size wins whenever nothing forces a stretch.
        if key == "width" || key == "height" { constraint.priority = .defaultHigh }
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

    private func contentMode(_ mode: String) -> UIView.ContentMode {
        switch mode {
        case "cover": return .scaleAspectFill
        case "stretch": return .scaleToFill
        case "center": return .center
        default: return .scaleAspectFit // "contain" / default
        }
    }

    private func keyboardType(_ type: String) -> UIKeyboardType {
        switch type {
        case "number", "numeric", "number-pad": return .numberPad
        case "decimal", "decimal-pad": return .decimalPad
        case "phone", "tel": return .phonePad
        case "email", "email-address": return .emailAddress
        case "url": return .URL
        default: return .default
        }
    }

    /// Load an image `src`/`source`: data:/base64 + bundled assets decode synchronously; remote
    /// http(s) is a deliberate follow-up. Any unresolvable source is ignored (never crashes).
    private func applyImageSource(_ image: UIImageView, _ value: NativePropValue) {
        var uri: String?
        if case let .string(s) = value {
            uri = s
        } else if case let .object(object) = value, case let .string(s)? = object["uri"] {
            uri = s
        }
        guard let src = uri else { return }
        image.clipsToBounds = true
        if src.hasPrefix("data:") {
            let payload = src.components(separatedBy: "base64,").last ?? ""
            if let data = Data(base64Encoded: payload), let decoded = UIImage(data: data) {
                image.image = decoded
            }
        } else if src.hasPrefix("http://") || src.hasPrefix("https://") {
            // Remote loading is a follow-up (needs an off-main fetch + lifecycle hook) — leave unset.
        } else {
            let name = src
                .replacingOccurrences(of: "asset:///", with: "")
                .replacingOccurrences(of: "file:///android_asset/", with: "")
            if let bundled = UIImage(named: name) { image.image = bundled }
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

/// Bridges a UITextField `.editingChanged` to the `input`/`change` callback (notify-only, no value).
private final class EditForwarder: NSObject {
    static var assocKey: UInt8 = 0
    private let fire: () -> Void

    init(_ fire: @escaping () -> Void) {
        self.fire = fire
        super.init()
    }

    @objc func handleChange() { fire() }
}
#endif
