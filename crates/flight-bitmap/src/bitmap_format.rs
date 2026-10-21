use flight_entity::Uint8Array;
use crate::types::*;

/// Converts a packed pixel buffer from one channel order to another.
// flight-lint: allow(conform-array) pixel ruling (agents/ir-vocabulary.md): no clamped array in the IR; TS Uint8ClampedArray pixel buffers become Uint8Array, stores clamp explicitly
pub fn convert_bitmap_pixel_order(
    out: &mut [u8],
    source: &Uint8Array,
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
    let (sr, sg, sb, sa) = channel_offsets(from);
    let (dr, dg, db, da) = channel_offsets(to);
    let mut i = 0;
    while i < length {
        let r = source[i + sr];
        let g = source[i + sg];
        let b = source[i + sb];
        let a = source[i + sa];
        out[i + dr] = r;
        out[i + dg] = g;
        out[i + db] = b;
        out[i + da] = a;
        i += 4;
    }
}

/// Converts straight-alpha pixels to premultiplied alpha.
// flight-lint: allow(conform-array) pixel ruling (agents/ir-vocabulary.md): no clamped array in the IR; TS Uint8ClampedArray pixel buffers become Uint8Array, stores clamp explicitly
pub fn premultiply_bitmap_pixels(out: &mut [u8], source: &Uint8Array, length: usize) {
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

/// Converts premultiplied-alpha pixels back to straight alpha.
// flight-lint: allow(conform-array) pixel ruling (agents/ir-vocabulary.md): no clamped array in the IR; TS Uint8ClampedArray pixel buffers become Uint8Array, stores clamp explicitly
pub fn unpremultiply_bitmap_pixels(out: &mut [u8], source: &Uint8Array, length: usize) {
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
            out[i] = (source[i] as f32 * inv).round().min(255.0) as u8;
            out[i + 1] = (source[i + 1] as f32 * inv).round().min(255.0) as u8;
            out[i + 2] = (source[i + 2] as f32 * inv).round().min(255.0) as u8;
            out[i + 3] = a;
        }
        i += 4;
    }
}

fn channel_offsets(order: PixelOrder) -> (usize, usize, usize, usize) {
    match order {
        PixelOrder::Rgba => (0, 1, 2, 3),
        PixelOrder::Bgra => (2, 1, 0, 3),
        PixelOrder::Argb => (1, 2, 3, 0),
        PixelOrder::Abgr => (3, 2, 1, 0),
    }
}
