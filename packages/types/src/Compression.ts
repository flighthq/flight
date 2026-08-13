// Turns compressed bytes into their uncompressed form, or null when the stream is malformed or the codec
// cannot read it. `uncompressedLength` is the length the container declared, or 0 when it declared none.
// `framing` is explicit because raw algorithm bytes and a wrapper can share a valid-looking prefix; the
// container knows which form its own specification carries, while the decoder cannot infer it safely.
//
// The contract is deliberately container-agnostic — payload bytes in, raw bytes out — so one registered
// implementation serves every format that carries a compressed body.
export type Decompressor = (
  compressed: Readonly<Uint8Array>,
  uncompressedLength: number,
  framing: CompressionFraming,
) => Uint8Array | null;

// Whether the bytes are the compression algorithm's raw stream or use RFC 1950's zlib framing. The
// framing is independent of the algorithm registry key: LZMA and Brotli use Raw, while DEFLATE is carried
// both ways by existing containers.
export const CompressionFraming = {
  Raw: 'Raw',
  Rfc1950: 'Rfc1950',
} as const;

export type CompressionFraming = (typeof CompressionFraming)[keyof typeof CompressionFraming];

// The compression algorithms a container can carry, named by algorithm rather than by any one format's
// signature or method byte, because a caller registers an implementation it has rather than a code it
// read. Framing is supplied separately at each decode call, so one `Deflate` registration still serves
// both raw RFC 1951 streams and RFC 1950 zlib wrappers without guessing between them.
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
