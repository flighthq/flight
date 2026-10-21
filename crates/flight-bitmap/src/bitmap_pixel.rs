use crate::bitmap::invalidate_bitmap;
use crate::types::*;

const LUMA_R: f32 = 0.2126;
const LUMA_G: f32 = 0.7152;
const LUMA_B: f32 = 0.0722;

/// Returns the packed 0xRRGGBBAA pixel at (x, y).
pub fn get_bitmap_pixel(source: &Bitmap, x: u32, y: u32) -> u32 {
    let i = (y as usize * source.width as usize + x as usize) * 4;
    ((source.data[i] as u32) << 24)
        | ((source.data[i + 1] as u32) << 16)
        | ((source.data[i + 2] as u32) << 8)
        | (source.data[i + 3] as u32)
}

/// Returns a single channel value at (x, y).
pub fn get_bitmap_pixel_channel(source: &Bitmap, x: u32, y: u32, channel: ImageChannel) -> u8 {
    source.data[(y as usize * source.width as usize + x as usize) * 4 + channel as usize]
}

/// Returns the perceptual luminance at (x, y).
pub fn get_bitmap_pixel_luminance(source: &Bitmap, x: u32, y: u32) -> u8 {
    let i = (y as usize * source.width as usize + x as usize) * 4;
    (source.data[i] as f32 * LUMA_R + source.data[i + 1] as f32 * LUMA_G + source.data[i + 2] as f32 * LUMA_B).round() as u8
}

/// Returns the packed 0xRRGGBB pixel at (x, y) (no alpha).
pub fn get_bitmap_pixel_rgb(source: &Bitmap, x: u32, y: u32) -> u32 {
    let i = (y as usize * source.width as usize + x as usize) * 4;
    ((source.data[i] as u32) << 16)
        | ((source.data[i + 1] as u32) << 8)
        | (source.data[i + 2] as u32)
}

/// Sets a pixel at (x, y) from packed 0xRRGGBBAA.
pub fn set_bitmap_pixel(out: &mut Bitmap, x: u32, y: u32, color: u32) {
    let i = (y as usize * out.width as usize + x as usize) * 4;
    out.data[i] = ((color >> 24) & 0xff) as u8;
    out.data[i + 1] = ((color >> 16) & 0xff) as u8;
    out.data[i + 2] = ((color >> 8) & 0xff) as u8;
    out.data[i + 3] = (color & 0xff) as u8;
    invalidate_bitmap(out);
}

/// Sets RGB channels at (x, y) from packed 0xRRGGBB, leaving alpha unchanged.
pub fn set_bitmap_pixel_rgb(out: &mut Bitmap, x: u32, y: u32, color: u32) {
    let i = (y as usize * out.width as usize + x as usize) * 4;
    out.data[i] = ((color >> 16) & 0xff) as u8;
    out.data[i + 1] = ((color >> 8) & 0xff) as u8;
    out.data[i + 2] = (color & 0xff) as u8;
    invalidate_bitmap(out);
}

// flight-lint: allow(conform-extra) pixel ruling (agents/ir-vocabulary.md): the explicit form of a TS Uint8ClampedArray store; TS has no function because the array clamps implicitly
/// Converts a float to a pixel byte exactly as a TS `Uint8ClampedArray` store does: round half to
/// even, then clamp to 0..=255. NaN becomes 0 (the saturating float cast supplies the clamp).
pub fn to_clamped_u8(value: f32) -> u8 {
    return value.round_ties_even() as u8;
}
