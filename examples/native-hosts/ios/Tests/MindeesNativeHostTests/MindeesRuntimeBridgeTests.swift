//
//  MindeesRuntimeBridgeTests.swift - embedded-runtime proof for the iOS host.
//
//  These tests exercise the same shape as the Android QuickJS example: JavaScript
//  emits NativeCommand JSON, the Swift host renders it, and native events dispatch
//  back into the embedded runtime.
//

import XCTest
#if canImport(UIKit)
import UIKit
#endif
@testable import MindeesNativeHost

final class MindeesRuntimeBridgeTests: XCTestCase {
    private func makeBridge(
        runtime: MindeesScriptRuntime
    ) -> (MindeesRuntimeBridge<ModelRenderer>, ModelNode) {
        let renderer = ModelRenderer()
        let root = renderer.makeElement("root")
        var bridge: MindeesRuntimeBridge<ModelRenderer>!
        let host = MindeesNativeHost(
            rootId: Self.hostRootId,
            root: root,
            renderer: renderer,
            onEvent: { handlerId, value in try? bridge.dispatchEvent(handlerId: handlerId, value: value) }
        )
        bridge = MindeesRuntimeBridge(host: host, runtime: runtime)
        return (bridge, root)
    }

    private func inner(_ root: ModelNode) -> String {
        root.children.map { $0.serialize() }.joined()
    }

    func testDispatchRequiresStartedBridge() {
        let (bridge, _) = makeBridge(runtime: RecordingRuntime())

        XCTAssertThrowsError(try bridge.dispatchEvent(handlerId: "counter.increment", value: nil)) { error in
            XCTAssertEqual(error as? MindeesRuntimeBridgeError, .notStarted)
        }
    }

    func testStartFailureClosesRuntimeAndLeavesBridgeStopped() {
        let runtime = FailingRuntime()
        let (bridge, _) = makeBridge(runtime: runtime)

        XCTAssertThrowsError(try bridge.start())
        XCTAssertFalse(bridge.isStarted)
        XCTAssertEqual(runtime.closeCount, 1)
    }

    func testStartFailureDiscardsBufferedRuntimeBatches() {
        let runtime = EmittingThenFailingRuntime()
        let (bridge, root) = makeBridge(runtime: runtime)

        XCTAssertThrowsError(try bridge.start())
        XCTAssertFalse(bridge.isStarted)
        XCTAssertEqual(runtime.closeCount, 1)
        XCTAssertEqual(inner(root), "")
    }

    func testCloseMarksBridgeStopped() throws {
        let runtime = RecordingRuntime()
        let (bridge, _) = makeBridge(runtime: runtime)

        try bridge.start()
        XCTAssertTrue(bridge.isStarted)

        bridge.close()
        XCTAssertFalse(bridge.isStarted)
        XCTAssertEqual(runtime.closeCount, 1)
        XCTAssertThrowsError(try bridge.dispatchEvent(handlerId: "counter.increment", value: nil)) { error in
            XCTAssertEqual(error as? MindeesRuntimeBridgeError, .notStarted)
        }
    }

    #if canImport(JavaScriptCore)
    func testJavaScriptCoreRuntimeRendersAndDispatchesCounter() throws {
        let (bridge, root) = makeBridge(runtime: JavaScriptCoreMindeesRuntime(source: Self.counterAppSource))

        try bridge.start()

        XCTAssertEqual(inner(root), "<view>Count: 0<button></button></view>")
        let screen = try XCTUnwrap(root.children.first)
        XCTAssertEqual(screen.children.count, 2)
        let button = try XCTUnwrap(screen.children.dropFirst().first)
        XCTAssertEqual(button.props["title"], NativePropValue.string("Increment"))

        try bridge.dispatchEvent(handlerId: "counter.increment", value: nil)

        XCTAssertEqual(inner(root), "<view>Count: 1<button></button></view>")
    }

    func testJavaScriptCoreRuntimePropagatesEmitFailures() {
        let source = """
        globalThis.MindeesApp = {
          start() {
            MindeesHost.emit("not json");
          },
          dispatchEvent(handlerId) {}
        };
        """
        let (bridge, _) = makeBridge(runtime: JavaScriptCoreMindeesRuntime(source: source))

        XCTAssertThrowsError(try bridge.start()) { error in
            guard case JavaScriptCoreMindeesRuntimeError.hostEmitFailed = error else {
                XCTFail("expected hostEmitFailed, got \(error)")
                return
            }
        }
        XCTAssertFalse(bridge.isStarted)
    }
    #endif

    #if canImport(UIKit) && canImport(JavaScriptCore)
    func testJavaScriptCoreRuntimeHandlesUIKitButtonTargetActionOnSimulator() throws {
        let container = UIView()
        let renderer = UIKitRenderer()
        var bridge: MindeesRuntimeBridge<UIKitRenderer>!
        let host = MindeesNativeHost(
            rootId: Self.hostRootId,
            root: container,
            renderer: renderer,
            onEvent: { handlerId, value in try? bridge.dispatchEvent(handlerId: handlerId, value: value) }
        )
        bridge = MindeesRuntimeBridge(
            host: host,
            runtime: JavaScriptCoreMindeesRuntime(source: Self.counterAppSource)
        )

        try bridge.start()

        let screen = try XCTUnwrap(container.subviews.first)
        XCTAssertEqual(screen.subviews.count, 2)
        let label = try XCTUnwrap(screen.subviews.first as? UILabel)
        let button = try XCTUnwrap(screen.subviews.dropFirst().first as? UIButton)
        XCTAssertEqual(label.text, "Count: 0")
        XCTAssertEqual(button.title(for: .normal), "Increment")

        try invokeTouchUpInsideTargetAction(on: button)

        XCTAssertEqual(label.text, "Count: 1")
    }

    private func invokeTouchUpInsideTargetAction(on control: UIControl) throws {
        var invokedActionCount = 0

        for target in control.allTargets {
            let targetObject = target.base
            let actions = control.actions(forTarget: targetObject, forControlEvent: .touchUpInside) ?? []
            for actionName in actions {
                let selector = NSSelectorFromString(actionName)
                let responder = try XCTUnwrap(
                    targetObject as? NSObject,
                    "touchUpInside target must be NSObject-backed so hostless XCTest can invoke it"
                )
                guard responder.responds(to: selector) else {
                    XCTFail("touchUpInside target does not respond to \(actionName)")
                    continue
                }
                _ = responder.perform(selector)
                invokedActionCount += 1
            }
        }

        XCTAssertEqual(invokedActionCount, 1)
    }
    #endif

    private static let hostRootId = "host-root"

    private static let counterAppSource = """
    const ids = {
      screen: "counter-screen",
      label: "counter-label",
      button: "counter-button"
    };
    let count = 0;
    let mounted = false;

    function emit(commands) {
      MindeesHost.emit(JSON.stringify(commands));
    }

    function renderCount() {
      emit([{ type: "updateText", id: ids.label, text: `Count: ${count}` }]);
    }

    globalThis.MindeesApp = {
      start() {
        if (mounted) return;
        mounted = true;
        emit([
          { type: "createNode", id: ids.screen, tag: "view" },
          { type: "createText", id: ids.label, text: "Count: 0" },
          { type: "createNode", id: ids.button, tag: "button" },
          {
            type: "setProp",
            id: ids.button,
            name: "title",
            value: "Increment"
          },
          {
            type: "registerEvent",
            id: ids.button,
            eventName: "press",
            handlerId: "counter.increment"
          },
          {
            type: "insertChild",
            parentId: ids.screen,
            childId: ids.label,
            index: 0
          },
          {
            type: "insertChild",
            parentId: ids.screen,
            childId: ids.button,
            index: 1
          },
          {
            type: "insertChild",
            parentId: "host-root",
            childId: ids.screen,
            index: 0
          }
        ]);
      },

      dispatchEvent(handlerId) {
        if (handlerId !== "counter.increment") return;
        count += 1;
        renderCount();
      }
    };
    """
}

private final class RecordingRuntime: MindeesScriptRuntime {
    var closeCount = 0
    var dispatched: [String] = []

    func start(sink: NativeCommandSink) throws {}

    func dispatchEvent(handlerId: String, value: String?) throws {
        dispatched.append(handlerId)
    }

    func close() {
        closeCount += 1
    }
}

private final class FailingRuntime: MindeesScriptRuntime {
    var closeCount = 0

    func start(sink: NativeCommandSink) throws {
        throw TestRuntimeError.startFailed
    }

    func dispatchEvent(handlerId: String, value: String?) throws {}

    func close() {
        closeCount += 1
    }
}

private final class EmittingThenFailingRuntime: MindeesScriptRuntime {
    var closeCount = 0

    func start(sink: NativeCommandSink) throws {
        try sink.applyBatch("""
        [
          {"type":"createText","id":"leaked-label","text":"Leaked"},
          {"type":"insertChild","parentId":"host-root","childId":"leaked-label","index":0}
        ]
        """)
        throw TestRuntimeError.startFailed
    }

    func dispatchEvent(handlerId: String, value: String?) throws {}

    func close() {
        closeCount += 1
    }
}

private enum TestRuntimeError: Error {
    case startFailed
}
