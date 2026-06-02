//
//  NativeCommand.swift — the wire model for the MindeesNative native command protocol.
//
//  Mirrors `@mindees/renderer`'s `native-protocol.ts`. Decode a batch with:
//      let commands = try JSONDecoder().decode([NativeCommand].self, from: jsonData)
//
//  ⚠️ Authored, not yet compiled by the maintainers — see Package.swift.
//

import Foundation

/// A native node id. Strings or numbers on the wire; normalized to a string here.
public struct NativeNodeId: Codable, Hashable, CustomStringConvertible {
    public let raw: String
    public init(_ raw: String) { self.raw = raw }

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let s = try? c.decode(String.self) {
            raw = s
        } else if let i = try? c.decode(Int.self) {
            raw = String(i)
        } else if let d = try? c.decode(Double.self) {
            raw = String(d)
        } else {
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "invalid node id")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(raw)
    }

    public var description: String { raw }
}

/// A serializable prop value (mirrors `NativePropValue`). Carries no functions.
public indirect enum NativePropValue: Codable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case array([NativePropValue])
    case object([String: NativePropValue])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self = .null
        } else if let b = try? c.decode(Bool.self) {
            self = .bool(b)
        } else if let n = try? c.decode(Double.self) {
            self = .number(n)
        } else if let s = try? c.decode(String.self) {
            self = .string(s)
        } else if let a = try? c.decode([NativePropValue].self) {
            self = .array(a)
        } else if let o = try? c.decode([String: NativePropValue].self) {
            self = .object(o)
        } else {
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "unsupported prop value")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let s): try c.encode(s)
        case .number(let n): try c.encode(n)
        case .bool(let b): try c.encode(b)
        case .null: try c.encodeNil()
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }
}

/// One native command (mirrors the `NativeCommand` union), decoded by its `type`.
public enum NativeCommand: Decodable {
    case createNode(id: NativeNodeId, tag: String)
    case createText(id: NativeNodeId, text: String)
    case setProp(id: NativeNodeId, name: String, value: NativePropValue)
    case removeProp(id: NativeNodeId, name: String)
    case insertChild(parentId: NativeNodeId, childId: NativeNodeId, index: Int)
    case removeChild(parentId: NativeNodeId, childId: NativeNodeId)
    case updateText(id: NativeNodeId, text: String)
    case disposeNode(id: NativeNodeId)
    case registerEvent(id: NativeNodeId, eventName: String, handlerId: String)
    case unregisterEvent(id: NativeNodeId, eventName: String, handlerId: String)

    private enum Key: String, CodingKey {
        case type, id, tag, text, name, value, parentId, childId, index, eventName, handlerId
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        let type = try c.decode(String.self, forKey: .type)
        switch type {
        case "createNode":
            self = .createNode(id: try c.decode(NativeNodeId.self, forKey: .id),
                               tag: try c.decode(String.self, forKey: .tag))
        case "createText":
            self = .createText(id: try c.decode(NativeNodeId.self, forKey: .id),
                               text: try c.decode(String.self, forKey: .text))
        case "setProp":
            self = .setProp(id: try c.decode(NativeNodeId.self, forKey: .id),
                            name: try c.decode(String.self, forKey: .name),
                            value: try c.decode(NativePropValue.self, forKey: .value))
        case "removeProp":
            self = .removeProp(id: try c.decode(NativeNodeId.self, forKey: .id),
                               name: try c.decode(String.self, forKey: .name))
        case "insertChild":
            self = .insertChild(parentId: try c.decode(NativeNodeId.self, forKey: .parentId),
                                childId: try c.decode(NativeNodeId.self, forKey: .childId),
                                index: try c.decode(Int.self, forKey: .index))
        case "removeChild":
            self = .removeChild(parentId: try c.decode(NativeNodeId.self, forKey: .parentId),
                                childId: try c.decode(NativeNodeId.self, forKey: .childId))
        case "updateText":
            self = .updateText(id: try c.decode(NativeNodeId.self, forKey: .id),
                               text: try c.decode(String.self, forKey: .text))
        case "disposeNode":
            self = .disposeNode(id: try c.decode(NativeNodeId.self, forKey: .id))
        case "registerEvent":
            self = .registerEvent(id: try c.decode(NativeNodeId.self, forKey: .id),
                                  eventName: try c.decode(String.self, forKey: .eventName),
                                  handlerId: try c.decode(String.self, forKey: .handlerId))
        case "unregisterEvent":
            self = .unregisterEvent(id: try c.decode(NativeNodeId.self, forKey: .id),
                                    eventName: try c.decode(String.self, forKey: .eventName),
                                    handlerId: try c.decode(String.self, forKey: .handlerId))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .type, in: c, debugDescription: "unknown command type \(type)")
        }
    }
}
