// Turns compressed bytes into their uncompressed form, or null when the stream is malformed or the codec
// cannot read it. `uncompressedLength` is the length the container declared, or 0 when it declared none:
// a format like LZMA needs it to know when to stop, and one like DEFLATE ignores it and grows its own
// buffer, so a caller passes what its header gave it and lets the codec decide whether that matters.
//
// The contract is deliberately container-agnostic — payload bytes in, raw bytes out — so one registered
// implementation serves every format that carries a compressed body.
export type Decompressor = (compressed: Readonly<Uint8Array>, uncompressedLength: number) => Uint8Array | null;

// The compression algorithms a container can carry, named by algorithm rather than by any one format's
// signature or method byte, because a caller registers an implementation it has rather than a code it
// read. `Deflate` covers both the raw RFC 1951 stream and the RFC 1950 zlib wrapper around it, which is
// the pair every real container mixes.
export const Compression = {
  // No Brotli implementation ships with Flight, deliberately. The decoder needs a large static
  // dictionary that is data rather than rules, so a caller registers a decompressor they already have —
  // Node's `zlib` carries one, and a browser needs an ordinary package because no browser API exposes
  // one (measured on one engine; other engines untested). Naming the algorithm here is what lets them.
  Brotli: 'brotli',
  Deflate: 'deflate',
  Lzma: 'lzma',
} as const;

export type Compression = (typeof Compression)[keyof typeof Compression];
