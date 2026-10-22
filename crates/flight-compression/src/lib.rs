mod compress;
mod deflate;
mod deflate_format;
mod host_explain;
mod lzma;
mod lzma_compress;
mod types;

pub mod contract;

// Public lane: the exports of the pinned TS `index.ts` (compress, deflate, lzma, lzmaCompress),
// plus the Rust types and constructors the public signatures require. Contract-only seams
// (deflate_format's tables and compute_adler32) stay in `contract`.
pub use contract::SDK_HOST_COMPRESS_DEFLATE;
pub use contract::SDK_HOST_COMPRESS_LZMA;
pub use contract::SDK_HOST_DECOMPRESS_DEFLATE;
pub use contract::SDK_HOST_DECOMPRESS_LZMA;
pub use contract::compress_deflate;
pub use contract::compress_deflate_zlib;
pub use contract::compress_lzma;
pub use contract::decompress_deflate;
pub use contract::decompress_lzma;

pub use contract::CompressionFraming;
pub use contract::Decompressor;
pub use contract::HostCompressCapabilities;
pub use contract::HostCompressDeflateCapability;
pub use contract::HostCompressLzmaCapability;
pub use contract::HostDecompressBrotliCapability;
pub use contract::HostDecompressCapabilities;
pub use contract::HostDecompressDeflateCapability;
pub use contract::HostDecompressLzmaCapability;

pub use contract::Compression;
pub use contract::get_compression_string;
pub use contract::parse_compression;
