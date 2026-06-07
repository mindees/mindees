//
//  UIKitRenderTests.swift — on-device(-simulator) rendering proof.
//
//  Unlike MindeesNativeHostTests (which uses the in-memory ModelRenderer and runs
//  anywhere via `swift test`), this exercises the REAL UIKitRenderer against actual
//  UIView objects, so it only builds/runs where UIKit exists — i.e. on an iOS
//  Simulator via `xcodebuild test -destination 'platform=iOS Simulator,...'`. It
//  decodes the JSON wire format the JS backend emits and asserts the resulting UIView
//  hierarchy — proving the command stream renders into correct native views.
//
//  ⚠️ Authored; verified by the iOS CI job on a simulator (no maintainer device).
//

#if canImport(UIKit)
import UIKit
import XCTest
@testable import MindeesNativeHost

final class UIKitRenderTests: XCTestCase {
    private func decode(_ json: String) throws -> [NativeCommand] {
        try JSONDecoder().decode([NativeCommand].self, from: Data(json.utf8))
    }

    func testRendersCommandStreamIntoUIViews() throws {
        let container = UIView()
        var fired: [String] = []
        let host = MindeesNativeHost(
            rootId: "host-root",
            root: container,
            renderer: UIKitRenderer(),
            onEvent: { handlerId, _ in fired.append(handlerId) }
        )

        // A <view> (with a press handler) containing a "Hello" label and a button.
        // The press is registered on the plain <view>, not the button: a UIButton
        // ships with built-in gesture recognizers, so a plain UIView gives a
        // deterministic recognizer count for the wiring assertion.
        try host.apply(decode("""
        [
          {"type":"createNode","id":"v","tag":"view"},
          {"type":"registerEvent","id":"v","eventName":"press","handlerId":"h1"},
          {"type":"createText","id":"t","text":"Hello"},
          {"type":"insertChild","parentId":"v","childId":"t","index":0},
          {"type":"createNode","id":"b","tag":"button"},
          {"type":"insertChild","parentId":"v","childId":"b","index":1},
          {"type":"insertChild","parentId":"host-root","childId":"v","index":0}
        ]
        """))

        // Real UIView hierarchy: container > view > [UILabel("Hello"), UIButton].
        XCTAssertEqual(container.subviews.count, 1)
        let view = try XCTUnwrap(container.subviews.first)
        XCTAssertEqual(view.subviews.count, 2)
        XCTAssertEqual((view.subviews[0] as? UILabel)?.text, "Hello")
        XCTAssertTrue(view.subviews[1] is UIButton)
        // The press registration wired exactly one real gesture recognizer onto the view.
        XCTAssertEqual(view.gestureRecognizers?.count, 1)
        XCTAssertTrue(fired.isEmpty) // not tapped yet

        // updateText patches the live label.
        try host.apply(decode("[{\"type\":\"updateText\",\"id\":\"t\",\"text\":\"Bye\"}]"))
        XCTAssertEqual((view.subviews[0] as? UILabel)?.text, "Bye")

        // Removing + disposing the label detaches it from the real view tree.
        try host.apply(decode("""
        [
          {"type":"removeChild","parentId":"v","childId":"t"},
          {"type":"disposeNode","id":"t"}
        ]
        """))
        XCTAssertEqual(view.subviews.count, 1)
        XCTAssertTrue(view.subviews[0] is UIButton)
    }

    func testInsertOrderMatchesIndices() throws {
        let container = UIView()
        let host = MindeesNativeHost(
            rootId: "host-root", root: container, renderer: UIKitRenderer(), onEvent: { _, _ in }
        )
        try host.apply(decode("""
        [
          {"type":"createText","id":"a","text":"A"},
          {"type":"createText","id":"b","text":"B"},
          {"type":"createText","id":"c","text":"C"},
          {"type":"insertChild","parentId":"host-root","childId":"a","index":0},
          {"type":"insertChild","parentId":"host-root","childId":"b","index":1},
          {"type":"insertChild","parentId":"host-root","childId":"c","index":2}
        ]
        """))
        let texts = container.subviews.compactMap { ($0 as? UILabel)?.text }
        XCTAssertEqual(texts, ["A", "B", "C"])
    }

    func testAppliesFlexAndVisualStyle() throws {
        let container = UIView()
        let host = MindeesNativeHost(
            rootId: "host-root", root: container, renderer: UIKitRenderer(), onEvent: { _, _ in }
        )
        try host.apply(decode("""
        [
          {"type":"createNode","id":"row","tag":"view"},
          {"type":"setProp","id":"row","name":"style","value":{
            "flexDirection":"row","justifyContent":"space-between","alignItems":"center","gap":12,
            "backgroundColor":"#161b2e","borderRadius":20,"opacity":0.9,"width":300
          }},
          {"type":"insertChild","parentId":"host-root","childId":"row","index":0}
        ]
        """))
        let row = try XCTUnwrap(container.subviews.first as? UIStackView)
        XCTAssertEqual(row.axis, .horizontal) // flexDirection:'row'
        XCTAssertEqual(row.distribution, .equalSpacing) // justifyContent:'space-between'
        XCTAssertEqual(row.alignment, .center) // alignItems:'center'
        XCTAssertEqual(row.spacing, 12) // gap
        XCTAssertNotNil(row.backgroundColor)
        XCTAssertEqual(row.layer.cornerRadius, 20)
        XCTAssertEqual(row.alpha, 0.9, accuracy: 0.001)
        XCTAssertTrue(row.constraints.contains { $0.firstAttribute == .width && abs($0.constant - 300) < 0.5 })
    }

    func testScrollViewWrapsVerticalContentStack() throws {
        let container = UIView()
        let host = MindeesNativeHost(
            rootId: "host-root", root: container, renderer: UIKitRenderer(), onEvent: { _, _ in }
        )
        try host.apply(decode("""
        [
          {"type":"createNode","id":"sv","tag":"scrollview"},
          {"type":"createText","id":"a","text":"Row A"},
          {"type":"insertChild","parentId":"sv","childId":"a","index":0},
          {"type":"insertChild","parentId":"host-root","childId":"sv","index":0}
        ]
        """))
        let scroll = try XCTUnwrap(container.subviews.first as? UIScrollView)
        let content = try XCTUnwrap(scroll.subviews.compactMap { $0 as? UIStackView }.first)
        XCTAssertEqual(content.axis, .vertical)
        XCTAssertEqual(content.arrangedSubviews.count, 1) // child routed into the content host
        XCTAssertEqual((content.arrangedSubviews[0] as? UILabel)?.text, "Row A")
    }

    func testHorizontalScrollViewContentIsRowStack() throws {
        let container = UIView()
        let host = MindeesNativeHost(
            rootId: "host-root", root: container, renderer: UIKitRenderer(), onEvent: { _, _ in }
        )
        try host.apply(decode("""
        [
          {"type":"createNode","id":"hsv","tag":"horizontalscrollview"},
          {"type":"insertChild","parentId":"host-root","childId":"hsv","index":0}
        ]
        """))
        let scroll = try XCTUnwrap(container.subviews.first as? UIScrollView)
        let content = try XCTUnwrap(scroll.subviews.compactMap { $0 as? UIStackView }.first)
        XCTAssertEqual(content.axis, .horizontal)
    }

    func testAppliesTextStyle() throws {
        let container = UIView()
        let host = MindeesNativeHost(
            rootId: "host-root", root: container, renderer: UIKitRenderer(), onEvent: { _, _ in }
        )
        // A `text` element (UILabel) receives the style. (Text-node composition into the element is a
        // separate pre-existing iOS gap, so we assert the styled label's properties, not its text.)
        try host.apply(decode("""
        [
          {"type":"createNode","id":"t","tag":"text"},
          {"type":"setProp","id":"t","name":"style","value":{
            "color":"#5b8cff","fontSize":40,"fontWeight":700,"textAlign":"center","numberOfLines":2
          }},
          {"type":"insertChild","parentId":"host-root","childId":"t","index":0}
        ]
        """))
        let label = try XCTUnwrap(container.subviews.first as? UILabel)
        XCTAssertEqual(label.numberOfLines, 2)
        XCTAssertEqual(label.textAlignment, .center)
        XCTAssertEqual(label.font.pointSize, 40, accuracy: 0.5)
        XCTAssertTrue(label.font.fontDescriptor.symbolicTraits.contains(.traitBold))
        XCTAssertNotNil(label.textColor)
    }

    func testWiresClickEvent() throws {
        let container = UIView()
        var fired: [String] = []
        let host = MindeesNativeHost(
            rootId: "host-root", root: container, renderer: UIKitRenderer(), onEvent: { handlerId, _ in fired.append(handlerId) }
        )
        try host.apply(decode("""
        [
          {"type":"createNode","id":"v","tag":"view"},
          {"type":"registerEvent","id":"v","eventName":"click","handlerId":"c1"},
          {"type":"insertChild","parentId":"host-root","childId":"v","index":0}
        ]
        """))
        let v = try XCTUnwrap(container.subviews.first)
        XCTAssertEqual(v.gestureRecognizers?.count, 1) // click wired exactly one recognizer
        _ = fired
    }

    func testRowLaysChildrenLeftToRightAfterLayout() throws {
        let container = UIView()
        container.frame = CGRect(x: 0, y: 0, width: 320, height: 200)
        let host = MindeesNativeHost(
            rootId: "host-root", root: container, renderer: UIKitRenderer(), onEvent: { _, _ in }
        )
        try host.apply(decode("""
        [
          {"type":"createNode","id":"row","tag":"view"},
          {"type":"setProp","id":"row","name":"style","value":{"flexDirection":"row","gap":8,"alignItems":"center"}},
          {"type":"createNode","id":"a","tag":"view"},
          {"type":"setProp","id":"a","name":"style","value":{"width":40,"height":20}},
          {"type":"createNode","id":"b","tag":"view"},
          {"type":"setProp","id":"b","name":"style","value":{"width":40,"height":20}},
          {"type":"insertChild","parentId":"row","childId":"a","index":0},
          {"type":"insertChild","parentId":"row","childId":"b","index":1},
          {"type":"insertChild","parentId":"host-root","childId":"row","index":0}
        ]
        """))
        let row = try XCTUnwrap(container.subviews.first as? UIStackView)
        row.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            row.topAnchor.constraint(equalTo: container.topAnchor),
        ])
        container.setNeedsLayout()
        container.layoutIfNeeded() // frames are .zero without a layout pass
        let a = row.arrangedSubviews[0]
        let b = row.arrangedSubviews[1]
        XCTAssertEqual(a.frame.width, 40, accuracy: 0.5)
        XCTAssertLessThanOrEqual(a.frame.maxX, b.frame.minX) // a is left of b
        XCTAssertEqual(b.frame.minX, a.frame.maxX + 8, accuracy: 0.5) // gap respected
    }

    func testComposesTextNodeChildrenIntoTextElement() throws {
        let container = UIView()
        let host = MindeesNativeHost(
            rootId: "host-root", root: container, renderer: UIKitRenderer(), onEvent: { _, _ in }
        )
        // Atlas Text renders as a `text` ELEMENT wrapping a text NODE. The element must compose its
        // text-node children into its own .text (not nest a label inside a label).
        try host.apply(decode("""
        [
          {"type":"createNode","id":"label","tag":"text"},
          {"type":"createText","id":"s","text":"Hello"},
          {"type":"insertChild","parentId":"label","childId":"s","index":0},
          {"type":"insertChild","parentId":"host-root","childId":"label","index":0}
        ]
        """))
        let label = try XCTUnwrap(container.subviews.first as? UILabel)
        XCTAssertEqual(label.text, "Hello") // composed, not nested
        XCTAssertTrue(label.subviews.isEmpty) // the text node is NOT a subview
        // updateText on the node re-composes the owning element.
        try host.apply(decode("[{\"type\":\"updateText\",\"id\":\"s\",\"text\":\"Bye\"}]"))
        XCTAssertEqual(label.text, "Bye")
    }

    func testLoadsBase64DataUriImage() throws {
        let container = UIView()
        let host = MindeesNativeHost(
            rootId: "host-root", root: container, renderer: UIKitRenderer(), onEvent: { _, _ in }
        )
        let png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
        try host.apply(decode("""
        [
          {"type":"createNode","id":"img","tag":"image"},
          {"type":"setProp","id":"img","name":"src","value":"\(png)"},
          {"type":"setProp","id":"img","name":"resizeMode","value":"cover"},
          {"type":"insertChild","parentId":"host-root","childId":"img","index":0}
        ]
        """))
        let image = try XCTUnwrap(container.subviews.first as? UIImageView)
        XCTAssertNotNil(image.image) // real UIImage(data:) decodes on a simulator
        XCTAssertEqual(image.contentMode, .scaleAspectFill) // resizeMode:'cover'
    }

    func testTextInputKeyboardSecureAndEditable() throws {
        let container = UIView()
        let host = MindeesNativeHost(
            rootId: "host-root", root: container, renderer: UIKitRenderer(), onEvent: { _, _ in }
        )
        try host.apply(decode("""
        [
          {"type":"createNode","id":"a","tag":"textinput"},
          {"type":"setProp","id":"a","name":"keyboardType","value":"email"},
          {"type":"setProp","id":"a","name":"placeholder","value":"Email"},
          {"type":"createNode","id":"b","tag":"textinput"},
          {"type":"setProp","id":"b","name":"secureTextEntry","value":true},
          {"type":"setProp","id":"b","name":"editable","value":false},
          {"type":"insertChild","parentId":"host-root","childId":"a","index":0},
          {"type":"insertChild","parentId":"host-root","childId":"b","index":1}
        ]
        """))
        let a = try XCTUnwrap(container.subviews[0] as? UITextField)
        XCTAssertEqual(a.keyboardType, .emailAddress)
        XCTAssertEqual(a.placeholder, "Email")
        let b = try XCTUnwrap(container.subviews[1] as? UITextField)
        XCTAssertTrue(b.isSecureTextEntry)
        XCTAssertFalse(b.isEnabled)
    }

    func testRendersActivityIndicator() throws {
        let container = UIView()
        let host = MindeesNativeHost(
            rootId: "host-root", root: container, renderer: UIKitRenderer(), onEvent: { _, _ in }
        )
        try host.apply(decode("""
        [
          {"type":"createNode","id":"s","tag":"activityindicator"},
          {"type":"setProp","id":"s","name":"style","value":{"color":"#ff0000"}},
          {"type":"insertChild","parentId":"host-root","childId":"s","index":0}
        ]
        """))
        let spinner = try XCTUnwrap(container.subviews.first as? UIActivityIndicatorView)
        XCTAssertTrue(spinner.isAnimating) // spins by default
        XCTAssertNotNil(spinner.color) // color tint applied
    }

    func testWiresAndDetachesTextChangeTarget() throws {
        // Asserts the renderer's wiring (target added for .editingChanged, removed on unregister) —
        // like the press test asserts recognizer registration. UITextField gates .editingChanged to a
        // real editing session, so firing it without a first responder/window is unreliable in a unit
        // test; the editingChanged→fire dispatch itself is UIKit's contract, exercised on a real device.
        let container = UIView()
        let host = MindeesNativeHost(
            rootId: "host-root", root: container, renderer: UIKitRenderer(), onEvent: { _, _ in }
        )
        try host.apply(decode("""
        [
          {"type":"createNode","id":"a","tag":"textinput"},
          {"type":"registerEvent","id":"a","eventName":"input","handlerId":"ch1"},
          {"type":"insertChild","parentId":"host-root","childId":"a","index":0}
        ]
        """))
        let field = try XCTUnwrap(container.subviews.first as? UITextField)
        XCTAssertEqual(field.allTargets.count, 1) // input wired exactly one target
        let target = try XCTUnwrap(field.allTargets.first)
        XCTAssertEqual(field.actions(forTarget: target, forControlEvent: .editingChanged)?.count, 1)
        try host.apply(decode("[{\"type\":\"unregisterEvent\",\"id\":\"a\",\"eventName\":\"input\",\"handlerId\":\"ch1\"}]"))
        XCTAssertEqual(field.allTargets.count, 0) // detached on unregister
    }
    func testOverlayLayerFillsAndStacksOnTop() throws {
        let container = UIView()
        container.frame = CGRect(x: 0, y: 0, width: 320, height: 600)
        let host = MindeesNativeHost(
            rootId: "host-root", root: container, renderer: UIKitRenderer(), onEvent: { _, _ in }
        )
        try host.apply(decode("""
        [
          {"type":"createNode","id":"content","tag":"view"},
          {"type":"insertChild","parentId":"host-root","childId":"content","index":0},
          {"type":"createNode","id":"ov","tag":"overlay"},
          {"type":"createNode","id":"scrim","tag":"view"},
          {"type":"insertChild","parentId":"ov","childId":"scrim","index":0},
          {"type":"insertChild","parentId":"host-root","childId":"ov","index":1}
        ]
        """))
        XCTAssertEqual(container.subviews.count, 2)
        let overlay = try XCTUnwrap(container.subviews.last) // added last → top of the z-order
        XCTAssertFalse(overlay.translatesAutoresizingMaskIntoConstraints)
        container.setNeedsLayout()
        container.layoutIfNeeded()
        XCTAssertEqual(overlay.frame, container.bounds) // pinned to fill the parent
    }
    func testRoutesRemoteImageSrcToTheLoader() throws {
        let container = UIView()
        var requested: String?
        let loader: ImageLoader = { url, onResult in
            requested = url
            onResult(nil) // no data → no decode; we assert the http(s) routing here
        }
        let host = MindeesNativeHost(
            rootId: "host-root", root: container,
            renderer: UIKitRenderer(imageLoader: loader), onEvent: { _, _ in }
        )
        try host.apply(decode("""
        [
          {"type":"createNode","id":"img","tag":"image"},
          {"type":"setProp","id":"img","name":"src","value":"https://example.com/a.png"},
          {"type":"insertChild","parentId":"host-root","childId":"img","index":0}
        ]
        """))
        XCTAssertEqual(requested, "https://example.com/a.png") // remote src routed to the loader
        XCTAssertTrue(container.subviews.first is UIImageView)
    }
}
#endif
