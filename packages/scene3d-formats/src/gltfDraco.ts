import type { GltfDracoDecoder } from '@flighthq/types/contract';

// The seam a caller plugs its own Draco decoder into. Flight ships no implementation: Draco is an
// export-time encoding choice, so a decoder is worth nothing to a consumer whose assets do not use it,
// and bundling one would put a third-party dependency into every build to serve some.
//
// It mirrors the shape of `@flighthq/compression`'s decompressor registry — empty until an explicit
// call, last-write-wins so a host can replace a portable decoder with a native or wasm one — but cannot
// reuse it: that registry is byte-to-byte, and a Draco payload decodes to structured mesh data rather
// than to bytes.
//
// The registry starting empty is what keeps this free: a build that never registers pulls in nothing,
// and `parseGltf` reports a Draco file's extension unsupported rather than pretending to import it.
export function getGltfDracoDecoder(): GltfDracoDecoder | null {
  return _dracoDecoder;
}

export function hasGltfDracoDecoder(): boolean {
  return _dracoDecoder !== null;
}

// Registers the decoder every later parse resolves through. Register a decoder that is READY: the
// contract is synchronous (see GltfDracoDecoder), so any WebAssembly or worker setup happens before
// this call, not inside the decode.
export function registerGltfDracoDecoder(decoder: GltfDracoDecoder): void {
  _dracoDecoder = decoder;
}

export function unregisterGltfDracoDecoder(): void {
  _dracoDecoder = null;
}

let _dracoDecoder: GltfDracoDecoder | null = null;
