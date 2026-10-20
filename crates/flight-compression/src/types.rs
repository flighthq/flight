/// Framing used for compressed data: raw DEFLATE stream or zlib-wrapped (RFC 1950).
#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum CompressionFraming {
    Raw = 0,
    Rfc1950 = 1,
}

/// A decompression function: takes compressed bytes, an optional uncompressed length (0 if unknown),
/// and framing, returning the decompressed bytes or None on failure.
pub type Decompressor = fn(&[u8], usize, CompressionFraming) -> Option<Vec<u8>>;

/// Host capability slot for deflate compression.
#[derive(Clone, Copy)]
pub struct HostCompressDeflateCapability {
    pub compress: fn(&[u8], CompressionFraming) -> Vec<u8>,
}

/// Host capability slot for deflate decompression.
#[derive(Clone, Copy)]
pub struct HostDecompressDeflateCapability {
    pub decompress: Decompressor,
}

/// Host capability slot for LZMA compression.
#[derive(Clone, Copy)]
pub struct HostCompressLzmaCapability {
    pub compress: fn(&[u8], CompressionFraming) -> Vec<u8>,
}

/// Host capability slot for LZMA decompression.
#[derive(Clone, Copy)]
pub struct HostDecompressLzmaCapability {
    pub decompress: Decompressor,
}
