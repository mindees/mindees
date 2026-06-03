// The WHATWG Encoding API (TextEncoder/TextDecoder) is a cross-platform global — present
// on Node, browsers, and Hermes/RN — but the neutral `es2023` lib does not declare it (and
// we deliberately avoid the full `dom` lib to stay Hermes-safe). These minimal ambient
// declarations cover exactly what the server backend's SSE byte-decoding uses.

declare class TextDecoder {
  decode(input?: Uint8Array, options?: { stream?: boolean }): string
}

declare class TextEncoder {
  encode(input?: string): Uint8Array
}
