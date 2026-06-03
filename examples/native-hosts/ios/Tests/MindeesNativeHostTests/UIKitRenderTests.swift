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
            onEvent: { fired.append($0) }
        )

        // A <view> containing a "Hello" label and a button (with a press handler).
        try host.apply(decode("""
        [
          {"type":"createNode","id":"v","tag":"view"},
          {"type":"createText","id":"t","text":"Hello"},
          {"type":"insertChild","parentId":"v","childId":"t","index":0},
          {"type":"createNode","id":"b","tag":"button"},
          {"type":"registerEvent","id":"b","eventName":"press","handlerId":"h1"},
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
        // The press registration wired a real gesture recognizer onto the button.
        XCTAssertEqual(view.subviews[1].gestureRecognizers?.count, 1)
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
            rootId: "host-root", root: container, renderer: UIKitRenderer(), onEvent: { _ in }
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
}
#endif
