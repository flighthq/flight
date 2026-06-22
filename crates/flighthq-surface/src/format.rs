//! Pixel format conversion: channel order and alpha premultiplication.

use flighthq_types::PixelOrder;

/// Converts a packed pixel buffer from one channel order to another.
/// Safe to pass the same buffer as both `out` and `source` — all four
/// channels are read into locals before any write.
pub fn convert_surface_pixel_order(
    out: &mut [u8],
    source: &[u8],
    length: usize,
    from: PixelOrder,
    to: PixelOrder,
) {
    if from == to {
        if !std::ptr::eq(out.as_ptr(), source.as_ptr()) {
            out[..length].copy_from_slice(&source[..length]);
        }
        return;
    }
    let [src_r, src_g, src_b, src_a] = channel_offsets(from);
    let [dst_r, dst_g, dst_b, dst_a] = channel_offsets(to);
    let mut i = 0;
    while i < length {
        let r = source[i + src_r];
        let g = source[i + src_g];
        let b = source[i + src_b];
        let a = source[i + src_a];
        out[i + dst_r] = r;
        out[i + dst_g] = g;
        out[i + dst_b] = b;
        out[i + dst_a] = a;
        i += 4;
    }
}

/// Converts straight-alpha pixels to premultiplied alpha in place or into a
/// separate buffer. RGB channels are multiplied by alpha/255.
/// Safe to pass the same buffer as both `out` and `source`.
pub fn premultiply_surface_pixels(out: &mut [u8], source: &[u8], length: usize) {
    let mut i = 0;
    while i < length {
        let a = source[i + 3] as f32 / 255.0;
        out[i] = (source[i] as f32 * a).round() as u8;
        out[i + 1] = (source[i + 1] as f32 * a).round() as u8;
        out[i + 2] = (source[i + 2] as f32 * a).round() as u8;
        out[i + 3] = source[i + 3];
        i += 4;
    }
}

/// Converts premultiplied-alpha pixels back to straight alpha in place or into
/// a separate buffer. Pixels with alpha=0 are written as (0,0,0,0).
/// Safe to pass the same buffer as both `out` and `source`.
pub fn unpremultiply_surface_pixels(out: &mut [u8], source: &[u8], length: usize) {
    let mut i = 0;
    while i < length {
        let a = source[i + 3];
        if a == 0 {
            out[i] = 0;
            out[i + 1] = 0;
            out[i + 2] = 0;
            out[i + 3] = 0;
        } else {
            let inv = 255.0 / a as f32;
            out[i] = 255.0_f32.min((source[i] as f32 * inv).round()) as u8;
            out[i + 1] = 255.0_f32.min((source[i + 1] as f32 * inv).round()) as u8;
            out[i + 2] = 255.0_f32.min((source[i + 2] as f32 * inv).round()) as u8;
            out[i + 3] = a;
        }
        i += 4;
    }
}

// Byte offsets of (R, G, B, A) within a 4-byte pixel for a given channel order.
fn channel_offsets(order: PixelOrder) -> [usize; 4] {
    match order {
        PixelOrder::Rgba => [0, 1, 2, 3],
        PixelOrder::Bgra => [2, 1, 0, 3],
        PixelOrder::Argb => [1, 2, 3, 0],
        PixelOrder::Abgr => [3, 2, 1, 0],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn convert_surface_pixel_order_rgba_to_bgra() {
        let source = [10u8, 20, 30, 40];
        let mut out = [0u8; 4];
        convert_surface_pixel_order(&mut out, &source, 4, PixelOrder::Rgba, PixelOrder::Bgra);
        assert_eq!(out, [30, 20, 10, 40]);
    }

    #[test]
    fn convert_surface_pixel_order_same_is_copy() {
        let source = [1u8, 2, 3, 4, 5, 6, 7, 8];
        let mut out = [0u8; 8];
        convert_surface_pixel_order(&mut out, &source, 8, PixelOrder::Rgba, PixelOrder::Rgba);
        assert_eq!(out, source);
    }

    #[test]
    fn premultiply_surface_pixels_roundtrip() {
        // white at half alpha -> ~128, then unpremultiply back to ~255
        let source = [255u8, 255, 255, 128];
        let mut pm = [0u8; 4];
        premultiply_surface_pixels(&mut pm, &source, 4);
        assert_eq!(pm[3], 128);
        assert!(pm[0] >= 127 && pm[0] <= 129);
        let mut back = [0u8; 4];
        unpremultiply_surface_pixels(&mut back, &pm, 4);
        assert_eq!(back[3], 128);
        assert!(back[0] >= 253);
    }

    #[test]
    fn unpremultiply_surface_pixels_zero_alpha() {
        let source = [99u8, 88, 77, 0];
        let mut out = [1u8; 4];
        unpremultiply_surface_pixels(&mut out, &source, 4);
        assert_eq!(out, [0, 0, 0, 0]);
    }
}
