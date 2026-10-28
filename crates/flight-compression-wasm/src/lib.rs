use wasm_bindgen::prelude::*;

use flight_compression::{
    CompressionFraming, compress_deflate, compress_deflate_zlib, compress_lzma, decompress_deflate,
    decompress_lzma,
};

#[wasm_bindgen]
pub fn compress_deflate_wasm(bytes: &[u8]) -> Vec<u8> {
    compress_deflate(bytes).into_vec()
}

#[wasm_bindgen]
pub fn compress_deflate_zlib_wasm(bytes: &[u8]) -> Vec<u8> {
    compress_deflate_zlib(bytes).into_vec()
}

#[wasm_bindgen]
pub fn compress_lzma_wasm(bytes: &[u8]) -> Vec<u8> {
    compress_lzma(bytes).into_vec()
}

#[wasm_bindgen]
pub fn decompress_deflate_wasm(
    compressed: &[u8],
    uncompressed_length: u32,
    framing: u32,
) -> Option<Vec<u8>> {
    let framing = match framing {
        0 => CompressionFraming::Raw,
        1 => CompressionFraming::Rfc1950,
        _ => return None,
    };
    decompress_deflate(compressed, uncompressed_length as usize, framing).map(|b| b.into_vec())
}

#[wasm_bindgen]
pub fn decompress_lzma_wasm(
    compressed: &[u8],
    uncompressed_length: u32,
    framing: u32,
) -> Option<Vec<u8>> {
    let framing = match framing {
        0 => CompressionFraming::Raw,
        1 => CompressionFraming::Rfc1950,
        _ => return None,
    };
    decompress_lzma(compressed, uncompressed_length as usize, framing).map(|b| b.into_vec())
}
