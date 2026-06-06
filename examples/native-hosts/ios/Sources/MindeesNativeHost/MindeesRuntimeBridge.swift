//
//  MindeesRuntimeBridge.swift - embeds JavaScriptCore and wires it to the native host.
//
//  This is the iOS/macOS twin of the Android QuickJS example bridge: JavaScript emits
//  serialized NativeCommand batches through MindeesHost.emit(json), and native press
//  callbacks are routed back to MindeesApp.dispatchEvent(handlerId).
//
//  CI-verified by the native iOS workflow (swift test + iOS Simulator XCTest).
//

import Foundation

/// Receives serialized native command batches from an embedded JavaScript runtime.
public protocol NativeCommandSink: AnyObject {
    func applyBatch(_ json: String) throws
}

/// A minimal embedded JavaScript runtime contract for MindeesNative examples.
public protocol MindeesScriptRuntime: AnyObject {
    func start(sink: NativeCommandSink) throws
    func dispatchEvent(handlerId: String, value: String?) throws
    func close()
}

public enum MindeesRuntimeBridgeError: Error, Equatable {
    case alreadyStarted
    case notStarted
}

/// Connects an embedded JavaScript runtime to a strict native host.
public final class MindeesRuntimeBridge<R: HostRenderer>: NativeCommandSink {
    private let host: MindeesNativeHost<R>
    private let runtime: MindeesScriptRuntime
    private let applyOnHostThread: (@escaping () throws -> Void) throws -> Void
    private var started = false
    private var starting = false
    private var startupBatches: [[NativeCommand]] = []

    public init(
        host: MindeesNativeHost<R>,
        runtime: MindeesScriptRuntime,
        applyOnHostThread: @escaping (@escaping () throws -> Void) throws -> Void = { action in try action() }
    ) {
        self.host = host
        self.runtime = runtime
        self.applyOnHostThread = applyOnHostThread
    }

    public var isStarted: Bool { started }

    public func start() throws {
        guard !started, !starting else { throw MindeesRuntimeBridgeError.alreadyStarted }
        starting = true
        startupBatches.removeAll()
        do {
            try runtime.start(sink: self)
            started = true
            starting = false
            let batches = startupBatches
            startupBatches.removeAll()
            for commands in batches {
                try applyCommands(commands)
            }
        } catch {
            started = false
            starting = false
            startupBatches.removeAll()
            runtime.close()
            throw error
        }
    }

    public func applyBatch(_ json: String) throws {
        let data = Data(json.utf8)
        let commands = try JSONDecoder().decode([NativeCommand].self, from: data)
        if starting {
            startupBatches.append(commands)
            return
        }
        guard started else { throw MindeesRuntimeBridgeError.notStarted }
        try applyCommands(commands)
    }

    private func applyCommands(_ commands: [NativeCommand]) throws {
        try applyOnHostThread {
            try self.host.apply(commands)
        }
    }

    public func dispatchEvent(handlerId: String, value: String? = nil) throws {
        guard started else { throw MindeesRuntimeBridgeError.notStarted }
        try runtime.dispatchEvent(handlerId: handlerId, value: value)
    }

    public func close() {
        if started {
            runtime.close()
            started = false
        }
    }
}

#if canImport(JavaScriptCore)
import JavaScriptCore

public enum JavaScriptCoreMindeesRuntimeError: Error, Equatable {
    case alreadyStarted
    case notStarted
    case missingGlobal(String)
    case javaScriptException(String)
    case hostEmitFailed(String)
}

/// JavaScriptCore-backed implementation of the MindeesScriptRuntime contract.
public final class JavaScriptCoreMindeesRuntime: MindeesScriptRuntime {
    private let source: String
    private let sourceName: String
    private var context: JSContext?
    private var app: JSValue?
    private var hostApi: JavaScriptCoreHostApi?
    private var lastException: String?

    public init(source: String, sourceName: String = "mindees-example.js") {
        self.source = source
        self.sourceName = sourceName
    }

    public func start(sink: NativeCommandSink) throws {
        guard context == nil else { throw JavaScriptCoreMindeesRuntimeError.alreadyStarted }

        guard let nextContext = JSContext() else {
            throw JavaScriptCoreMindeesRuntimeError.javaScriptException("JavaScriptCore context creation failed")
        }

        lastException = nil
        nextContext.exceptionHandler = { [weak self] _, exception in
            self?.lastException = exception?.toString() ?? "unknown JavaScript exception"
        }

        let nextHostApi = JavaScriptCoreHostApi(sink: sink)
        nextContext.setObject(nextHostApi, forKeyedSubscript: "MindeesHost" as NSString)
        _ = nextContext.evaluateScript(source, withSourceURL: URL(fileURLWithPath: sourceName))
        try rethrowPendingFailures(from: nextHostApi)

        guard let nextApp = nextContext.objectForKeyedSubscript("MindeesApp"),
              !nextApp.isUndefined,
              !nextApp.isNull
        else {
            throw JavaScriptCoreMindeesRuntimeError.missingGlobal("MindeesApp")
        }
        guard let start = nextApp.objectForKeyedSubscript("start"),
              !start.isUndefined,
              !start.isNull
        else {
            throw JavaScriptCoreMindeesRuntimeError.missingGlobal("MindeesApp.start")
        }
        guard let dispatch = nextApp.objectForKeyedSubscript("dispatchEvent"),
              !dispatch.isUndefined,
              !dispatch.isNull
        else {
            throw JavaScriptCoreMindeesRuntimeError.missingGlobal("MindeesApp.dispatchEvent")
        }

        _ = nextApp.invokeMethod("start", withArguments: [])
        try rethrowPendingFailures(from: nextHostApi)

        context = nextContext
        app = nextApp
        hostApi = nextHostApi
    }

    public func dispatchEvent(handlerId: String, value: String?) throws {
        guard let app else { throw JavaScriptCoreMindeesRuntimeError.notStarted }
        // Pass the raw value as a 2nd JS arg only when present; the JS layer wraps it as
        // { target: { value } }. Notify-only events pass [handlerId] alone (value stays undefined in JS).
        let arguments: [Any] = value.map { [handlerId, $0] } ?? [handlerId]
        _ = app.invokeMethod("dispatchEvent", withArguments: arguments)
        try rethrowPendingFailures(from: hostApi)
    }

    public func close() {
        app = nil
        hostApi = nil
        context = nil
        lastException = nil
    }

    private func rethrowPendingFailures(from hostApi: JavaScriptCoreHostApi?) throws {
        if let message = takeException() {
            throw JavaScriptCoreMindeesRuntimeError.javaScriptException(message)
        }
        if let error = hostApi?.takeFailure() {
            throw JavaScriptCoreMindeesRuntimeError.hostEmitFailed(String(describing: error))
        }
    }

    private func takeException() -> String? {
        let message = lastException
        lastException = nil
        return message
    }
}

@objc private protocol MindeesHostJavaScriptApi: JSExport {
    func emit(_ json: String)
}

private final class JavaScriptCoreHostApi: NSObject, MindeesHostJavaScriptApi {
    private weak var sink: NativeCommandSink?
    private var failure: Error?

    init(sink: NativeCommandSink) {
        self.sink = sink
    }

    func emit(_ json: String) {
        guard let sink else {
            failure = JavaScriptCoreMindeesRuntimeError.notStarted
            return
        }
        do {
            try sink.applyBatch(json)
        } catch {
            failure = error
        }
    }

    func takeFailure() -> Error? {
        let current = failure
        failure = nil
        return current
    }
}
#endif
