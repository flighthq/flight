// Turns a SWF's compressed body into its uncompressed bytes, or null when the stream is malformed.
// `uncompressedLength` is the length the file header declares, so a decompressor can size its output
// buffer up front and a caller can tell a short result from a complete one.
//
// SWF carries two compressed container forms and neither is SWF's own format, so the codec does not
// vendor either: `swf` exposes this seam and a caller registers what it already has. The bytes handed in
// start at the compressed stream itself — after the 8-byte file header for zlib, and after the header,
// compressed length, and LZMA properties for LZMA.
export type SwfDecompressor = (compressed: Uint8Array, uncompressedLength: number) => Uint8Array | null;

// The compressed container forms, named by the algorithm rather than by SWF's signature bytes, since a
// caller registers an algorithm it has rather than a signature it read.
export const SwfCompression = {
  Lzma: 'lzma',
  Zlib: 'zlib',
} as const;

export type SwfCompression = (typeof SwfCompression)[keyof typeof SwfCompression];
