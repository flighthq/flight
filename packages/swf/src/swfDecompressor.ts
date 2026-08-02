import type { SwfCompression, SwfDecompressor } from '@flighthq/types/contract';

// The decompressors a caller has opted into. Compression is not SWF's own domain — a `CWS` body is a zlib
// stream and a `ZWS` body is an LZMA one, both general formats that ride inside the container — so this
// package exposes the seam and vendors neither codec. The registry starts empty and is only ever filled by
// an explicit `registerSwfDecompressor` call, so importing this module registers nothing and a build that
// never compresses pays nothing.
//
// Registration is last-write-wins, which is what lets a host replace a portable decoder with a native one.
export function getSwfDecompressor(compression: SwfCompression): SwfDecompressor | null {
  return _decompressors.get(compression) ?? null;
}

export function registerSwfDecompressor(compression: SwfCompression, decompress: SwfDecompressor): void {
  _decompressors.set(compression, decompress);
}

export function unregisterSwfDecompressor(compression: SwfCompression): void {
  _decompressors.delete(compression);
}

const _decompressors = new Map<SwfCompression, SwfDecompressor>();
