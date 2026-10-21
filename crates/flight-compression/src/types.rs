use std::sync::Arc;

use flight_entity::Uint8Array;

/// Canonical algorithm keys used by compressed containers and host registrations.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Compression {
    Brotli,
    Deflate,
    Lzma,
}

/// Framing used for compressed data: raw DEFLATE stream or zlib-wrapped (RFC 1950).
/// TS: a closed string union whose values are the serialized strings `'Raw'` and `'Rfc1950'`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CompressionFraming {
    Raw,
    Rfc1950,
}

/// A decompression function: takes compressed bytes, an optional uncompressed length (0 if unknown),
/// and framing, returning the decompressed bytes or None on failure.
pub type Decompressor =
    Arc<dyn Fn(&Uint8Array, usize, CompressionFraming) -> Option<Box<Uint8Array>> + Send + Sync>;

/// The compression (encoding) capability group (TS `HostCompressCapabilities`). An omitted slot is
/// capability absence.
#[derive(Clone, Default)]
pub struct HostCompressCapabilities {
    pub deflate: Option<HostCompressDeflateCapability>,
    pub lzma: Option<HostCompressLzmaCapability>,
}

/// Host capability slot for deflate compression.
#[derive(Clone, Copy)]
pub struct HostCompressDeflateCapability {
    pub compress: fn(&Uint8Array, CompressionFraming) -> Box<Uint8Array>,
}

/// Host capability slot for brotli decompression (TS `HostDecompressBrotliCapability`). Brotli has
/// no SDK decoder; a host that can decode it supplies this slot.
#[derive(Clone)]
pub struct HostDecompressBrotliCapability {
    pub decompress: Decompressor,
}

/// The decompression capability group (TS `HostDecompressCapabilities`). An omitted slot is
/// capability absence.
#[derive(Clone, Default)]
pub struct HostDecompressCapabilities {
    pub brotli: Option<HostDecompressBrotliCapability>,
    pub deflate: Option<HostDecompressDeflateCapability>,
    pub lzma: Option<HostDecompressLzmaCapability>,
}

/// Host capability slot for deflate decompression.
#[derive(Clone)]
pub struct HostDecompressDeflateCapability {
    pub decompress: Decompressor,
}

/// Host capability slot for LZMA compression.
#[derive(Clone, Copy)]
pub struct HostCompressLzmaCapability {
    pub compress: fn(&Uint8Array, CompressionFraming) -> Box<Uint8Array>,
}

/// Host capability slot for LZMA decompression.
#[derive(Clone)]
pub struct HostDecompressLzmaCapability {
    pub decompress: Decompressor,
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS CompressionFraming string union; @flighthq/types exports the constant union only
pub fn get_compression_framing_string(value: CompressionFraming) -> &'static str {
    return match value {
        CompressionFraming::Raw => "Raw",
        CompressionFraming::Rfc1950 => "Rfc1950",
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for the types/Compression.ts algorithm union
pub fn get_compression_string(value: Compression) -> &'static str {
    return match value {
        Compression::Brotli => "brotli",
        Compression::Deflate => "deflate",
        Compression::Lzma => "lzma",
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for the types/Compression.ts algorithm union
pub fn parse_compression(value: &str) -> Option<Compression> {
    return match value {
        "brotli" => Some(Compression::Brotli),
        "deflate" => Some(Compression::Deflate),
        "lzma" => Some(Compression::Lzma),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS CompressionFraming string union; @flighthq/types exports the constant union only
pub fn parse_compression_framing(value: &str) -> Option<CompressionFraming> {
    return match value {
        "Raw" => Some(CompressionFraming::Raw),
        "Rfc1950" => Some(CompressionFraming::Rfc1950),
        _ => None,
    };
}
