// A pluggable decompressor for an AWD file's compressed body. Away3D's exporter defaults to a
// compressed body (deflate, occasionally LZMA); the 12-byte header stays uncompressed and everything
// after it is the compressed block stream. A decompressor inflates that payload back to the raw block
// stream, or returns null when it cannot. Codecs are registered per compression method via
// `registerAwd2Decompressor` so an inflate/LZMA implementation stays tree-shakable — a bundle that only
// imports uncompressed AWD never pulls a codec into its output. The contract is format-version-agnostic
// (payload bytes in, raw bytes out), so a future AWD3 parser reuses this same type.
export type AwdDecompressor = (compressed: Readonly<Uint8Array>) => Uint8Array | null;
