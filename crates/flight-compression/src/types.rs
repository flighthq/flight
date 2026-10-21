use std::sync::Arc;

use flight_entity::Uint8Array;

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

/// Host capability slot for deflate compression.
#[derive(Clone, Copy)]
pub struct HostCompressDeflateCapability {
    pub compress: fn(&Uint8Array, CompressionFraming) -> Box<Uint8Array>,
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

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS CompressionFraming string union; @flighthq/types exports the constant union only
pub fn parse_compression_framing(value: &str) -> Option<CompressionFraming> {
    return match value {
        "Raw" => Some(CompressionFraming::Raw),
        "Rfc1950" => Some(CompressionFraming::Rfc1950),
        _ => None,
    };
}
