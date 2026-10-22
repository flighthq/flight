use flight_bitmap::{Bitmap, create_bitmap};
use flight_compression::{CompressionFraming, HostDecompressDeflateCapability};
use flight_entity::Uint8Array;
use flight_image_codec::DecodedImage;
use flight_texture::AlphaType;

use crate::SwfJpegAlphaPayload;

pub fn create_swf_jpeg_alpha_bitmap(
    decoded: &DecodedImage,
    payload: &SwfJpegAlphaPayload,
    deflate: &HostDecompressDeflateCapability,
) -> Option<Bitmap> {
    if decoded.width != payload.width as usize || decoded.height != payload.height as usize {
        return None;
    }
    let pixel_count = payload.width as usize * payload.height as usize;
    if pixel_count == 0 || pixel_count > MAX_PIXELS || decoded.data.len() != pixel_count * 4 {
        return None;
    }

    let alpha = (deflate.decompress)(
        &payload.compressed_alpha_bytes,
        pixel_count,
        CompressionFraming::Rfc1950,
    )?;
    if alpha.len() != pixel_count {
        return None;
    }

    let mut bitmap = create_bitmap(payload.width, payload.height, None);
    bitmap.data.copy_from_slice(&decoded.data);
    for pixel in 0..pixel_count {
        bitmap.data[pixel * 4 + 3] = alpha[pixel];
    }
    return Some(bitmap);
}

pub fn create_swf_lossless_bitmap(
    payload: &Uint8Array,
    has_alpha: bool,
    deflate: &HostDecompressDeflateCapability,
) -> Option<Bitmap> {
    if payload.len() < LOSSLESS_HEADER_BYTES {
        return None;
    }
    let format = payload[0];
    let width = u32::from(payload[1]) + u32::from(payload[2]) * 0x100;
    let height = u32::from(payload[3]) + u32::from(payload[4]) * 0x100;
    let pixel_count = width as usize * height as usize;
    if width == 0 || height == 0 || pixel_count > MAX_PIXELS {
        return None;
    }

    let has_color_table = format == FORMAT_COLOR_MAPPED;
    let color_count = if has_color_table {
        usize::from(*payload.get(5)?) + 1
    } else {
        0
    };
    let compressed_start = LOSSLESS_HEADER_BYTES + usize::from(has_color_table);
    let compressed = payload.get(compressed_start..)?;
    let uncompressed_length = if has_color_table {
        color_count * if has_alpha { 4 } else { 3 }
            + align_swf_row(width as usize) * height as usize
    } else if format == FORMAT_15_BIT {
        align_swf_row(width as usize * 2) * height as usize
    } else {
        width as usize * 4 * height as usize
    };

    let pixels =
        (deflate.decompress)(compressed, uncompressed_length, CompressionFraming::Rfc1950)?;
    if pixels.len() != uncompressed_length {
        return None;
    }

    let mut bitmap = create_bitmap(width, height, None);
    let unpacked = if has_color_table {
        unpack_swf_color_mapped(
            &mut bitmap,
            &pixels,
            width as usize,
            height as usize,
            color_count,
            has_alpha,
        )
    } else if format == FORMAT_15_BIT {
        unpack_swf_15_bit(&mut bitmap, &pixels, width as usize, height as usize)
    } else {
        unpack_swf_24_bit(
            &mut bitmap,
            &pixels,
            width as usize,
            height as usize,
            has_alpha,
        )
    };
    if !unpacked {
        return None;
    }
    bitmap.alpha_type = if has_alpha {
        AlphaType::Premultiplied
    } else {
        AlphaType::Opaque
    };
    return Some(bitmap);
}

fn align_swf_row(bytes: usize) -> usize {
    return (bytes + 3) & !3;
}

fn unpack_swf_15_bit(bitmap: &mut Bitmap, pixels: &[u8], width: usize, height: usize) -> bool {
    let stride = align_swf_row(width * 2);
    if pixels.len() < stride * height {
        return false;
    }
    for y in 0..height {
        let row = y * stride;
        for x in 0..width {
            let value = u32::from(pixels[row + x * 2]) * 0x100 + u32::from(pixels[row + x * 2 + 1]);
            let target = (y * width + x) * 4;
            bitmap.data[target] =
                ((((value >> 10) & 0x1f) * 0xff) as f32 / 0x1f as f32).round() as u8;
            bitmap.data[target + 1] =
                ((((value >> 5) & 0x1f) * 0xff) as f32 / 0x1f as f32).round() as u8;
            bitmap.data[target + 2] = (((value & 0x1f) * 0xff) as f32 / 0x1f as f32).round() as u8;
            bitmap.data[target + 3] = 0xff;
        }
    }
    return true;
}

fn unpack_swf_24_bit(
    bitmap: &mut Bitmap,
    pixels: &[u8],
    width: usize,
    height: usize,
    has_alpha: bool,
) -> bool {
    let stride = width * 4;
    if pixels.len() < stride * height {
        return false;
    }
    for pixel in 0..width * height {
        let source = pixel * 4;
        let target = pixel * 4;
        bitmap.data[target] = pixels[source + 1];
        bitmap.data[target + 1] = pixels[source + 2];
        bitmap.data[target + 2] = pixels[source + 3];
        bitmap.data[target + 3] = if has_alpha { pixels[source] } else { 0xff };
    }
    return true;
}

fn unpack_swf_color_mapped(
    bitmap: &mut Bitmap,
    pixels: &[u8],
    width: usize,
    height: usize,
    color_count: usize,
    has_alpha: bool,
) -> bool {
    let entry_bytes = if has_alpha { 4 } else { 3 };
    let table_bytes = color_count * entry_bytes;
    let stride = align_swf_row(width);
    if pixels.len() < table_bytes + stride * height {
        return false;
    }
    for y in 0..height {
        let row = table_bytes + y * stride;
        for x in 0..width {
            let entry = if table_bytes == 0 {
                0
            } else {
                usize::from(pixels[row + x]) * entry_bytes
            };
            let target = (y * width + x) * 4;
            bitmap.data[target] = pixels.get(entry).copied().unwrap_or(0);
            bitmap.data[target + 1] = pixels.get(entry + 1).copied().unwrap_or(0);
            bitmap.data[target + 2] = pixels.get(entry + 2).copied().unwrap_or(0);
            bitmap.data[target + 3] = if has_alpha {
                pixels.get(entry + 3).copied().unwrap_or(0)
            } else {
                0xff
            };
        }
    }
    return true;
}

const FORMAT_15_BIT: u8 = 4;
const FORMAT_COLOR_MAPPED: u8 = 3;
const LOSSLESS_HEADER_BYTES: usize = 5;
const MAX_PIXELS: usize = 64_000_000;
