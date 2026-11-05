/** @deprecated Import compression contracts from `@flighthq/compression/contract`. These runtime
 * values stay duplicated here because @flighthq/types may re-export owner contracts only as types. */
export const CompressionFraming = {
  Raw: 'Raw',
  Rfc1950: 'Rfc1950',
} as const;

export type CompressionFraming = (typeof CompressionFraming)[keyof typeof CompressionFraming];

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

/** @deprecated Import compression contracts from `@flighthq/compression/contract`. */
export type {
  Decompressor,
  HostCompressDeflateCapability,
  HostCompressLzmaCapability,
  HostDecompressBrotliCapability,
  HostDecompressDeflateCapability,
  HostDecompressLzmaCapability,
} from '@flighthq/compression/contract';
