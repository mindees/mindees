//
//  MindeesNativeHostTests.swift — verifies the host's command-apply + validation
//  logic with the in-memory ModelRenderer (no UIKit → runs via `swift test`).
//
//  These mirror @mindees/renderer's TypeScript conformance suite, so a passing run
//  here means this host implements the same contract.
//
//  ⚠️ Authored, not yet run by the maintainers — please `swift test` and report.
//

import XCTest
@testable import MindeesNativeHost

final class MindeesNativeHostTests: XCTestCase {
    private func makeHost() -> (MindeesNativeHost<ModelRenderer>, ModelNode) {
        let renderer = ModelRenderer()
        let root = renderer.makeElement("root")
        let host = MindeesNativeHost(rootId: "host-root", root: root, renderer: renderer, onEvent: { _ in })
        return (host, root)
    }

    private func inner(_ root: ModelNode) -> String {
        root.children.map { $0.serialize() }.joined()
    }

    func testReconstructsStaticTreeFromJSON() throws {
        let (host, root) = makeHost()
        let json = """
        [
          {"type":"createNode","id":"v","tag":"view"},
          {"type":"createText","id":"t","text":"Hello"},
          {"type":"insertChild","parentId":"v","childId":"t","index":0},
          {"type":"insertChild","parentId":"host-root","childId":"v","index":0}
        ]
        """
        let commands = try JSONDecoder().decode([NativeCommand].self, from: Data(json.utf8))
        try host.apply(commands)
        XCTAssertEqual(inner(root), "<view>Hello</view>")
        XCTAssertEqual(host.liveNodeCount, 2)
    }

    func testPreservesSiblingOrder() throws {
        let (host, root) = makeHost()
        try host.apply([
            .createText(id: .init("a"), text: "A"),
            .createText(id: .init("b"), text: "B"),
            .createText(id: .init("c"), text: "C"),
            .insertChild(parentId: .init("host-root"), childId: .init("a"), index: 0),
            .insertChild(parentId: .init("host-root"), childId: .init("b"), index: 1),
            .insertChild(parentId: .init("host-root"), childId: .init("c"), index: 2),
        ])
        XCTAssertEqual(inner(root), "ABC")
    }

    func testUpdateText() throws {
        let (host, root) = makeHost()
        try host.apply([
            .createText(id: .init("t"), text: "x"),
            .insertChild(parentId: .init("host-root"), childId: .init("t"), index: 0),
            .updateText(id: .init("t"), text: "y"),
        ])
        XCTAssertEqual(inner(root), "y")
    }

    func testNoOrphansAfterDispose() throws {
        let (host, root) = makeHost()
        try host.apply([
            .createNode(id: .init("v"), tag: "view"),
            .createText(id: .init("t"), text: "x"),
            .insertChild(parentId: .init("v"), childId: .init("t"), index: 0),
            .insertChild(parentId: .init("host-root"), childId: .init("v"), index: 0),
        ])
        XCTAssertEqual(host.liveNodeCount, 2)
        // Remove the subtree root, then free both nodes (deepest-first).
        try host.apply([
            .removeChild(parentId: .init("host-root"), childId: .init("v")),
            .disposeNode(id: .init("t")),
            .disposeNode(id: .init("v")),
        ])
        XCTAssertEqual(inner(root), "")
        XCTAssertEqual(host.liveNodeCount, 0)
    }

    func testRegistersEventWiring() throws {
        var fired: [String] = []
        let renderer = ModelRenderer()
        let root = renderer.makeElement("root")
        let host = MindeesNativeHost(rootId: "host-root", root: root, renderer: renderer,
                                     onEvent: { fired.append($0) })
        try host.apply([
            .createNode(id: .init("btn"), tag: "button"),
            .insertChild(parentId: .init("host-root"), childId: .init("btn"), index: 0),
            .registerEvent(id: .init("btn"), eventName: "press", handlerId: "h1"),
        ])
        XCTAssertEqual(root.children.first?.events["press"], "h1")
        // (Firing a real tap is exercised by the UIKitRenderer on a device.)
        XCTAssertTrue(fired.isEmpty)
    }

    func testDisposingInteriorNodeDetachesFromRendererTree() throws {
        let (host, root) = makeHost()
        try host.apply([
            .createNode(id: .init("v"), tag: "view"),
            .createText(id: .init("t"), text: "x"),
            .insertChild(parentId: .init("v"), childId: .init("t"), index: 0),
            .insertChild(parentId: .init("host-root"), childId: .init("v"), index: 0),
        ])
        // Dispose the interior text node while its <view> parent is still present.
        try host.apply([.disposeNode(id: .init("t"))])
        // The renderer (model) tree must no longer contain the disposed child.
        XCTAssertEqual(root.children.first?.children.count, 0)
        XCTAssertEqual(inner(root), "<view></view>")
    }

    // --- strict validation (the conformance contract) ---

    func testRejectsDuplicateId() throws {
        let (host, _) = makeHost()
        try host.apply([.createNode(id: .init("a"), tag: "view")])
        XCTAssertThrowsError(try host.apply([.createNode(id: .init("a"), tag: "view")]))
    }

    func testRejectsUnknownNode() {
        let (host, _) = makeHost()
        XCTAssertThrowsError(try host.apply([.updateText(id: .init("ghost"), text: "x")]))
    }

    func testRejectsRemoveChildOfNonChild() throws {
        let (host, _) = makeHost()
        try host.apply([
            .createNode(id: .init("p"), tag: "view"),
            .createNode(id: .init("c"), tag: "view"),
            .insertChild(parentId: .init("host-root"), childId: .init("p"), index: 0),
        ])
        XCTAssertThrowsError(try host.apply([.removeChild(parentId: .init("p"), childId: .init("c"))]))
    }

    func testRejectsDoubleDispose() throws {
        let (host, _) = makeHost()
        try host.apply([
            .createNode(id: .init("a"), tag: "view"),
            .disposeNode(id: .init("a")),
        ])
        XCTAssertThrowsError(try host.apply([.disposeNode(id: .init("a"))]))
    }

    func testCannotDisposeRoot() {
        let (host, _) = makeHost()
        XCTAssertThrowsError(try host.apply([.disposeNode(id: .init("host-root"))]))
    }
}
