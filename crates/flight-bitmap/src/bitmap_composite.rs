use crate::bitmap::invalidate_bitmap;
use crate::types::*;
use flight_entity::Uint8Array;

#[cfg(test)]
mod sugar_tests {
    use crate::contract::*;

    fn test_bitmap() -> Bitmap {
        let mut out = create_bitmap(4, 4, Some(0x336699ff));
        set_bitmap_pixel(&mut out, 1, 1, 0x00000000);
        set_bitmap_pixel(&mut out, 2, 1, 0xff8000c0);
        return out;
    }

    fn test_region() -> BitmapRegion {
        return create_bitmap_region(test_bitmap(), 0, 0, 4, 4);
    }

    #[test]
    fn bitmapregion_composite_pixels_matches_composite_bitmap_pixels() {
        let mut a = test_region();
        let mut b = test_region();
        let ra = a.composite_pixels(&vec![7u8; 64], BitmapCompositeMode::Multiply);
        let rb = composite_bitmap_pixels(&mut b, &vec![7u8; 64], BitmapCompositeMode::Multiply);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn bitmapregion_composite_region_matches_composite_bitmap_region() {
        let mut a = test_region();
        let mut b = test_region();
        let ra = a.composite_region(&test_region(), BitmapCompositeMode::Multiply);
        let rb = composite_bitmap_region(&mut b, &test_region(), BitmapCompositeMode::Multiply);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn bitmapregion_write_pixels_matches_write_bitmap_pixels() {
        let mut a = test_region();
        let mut b = test_region();
        let ra = a.write_pixels(&vec![7u8; 64]);
        let rb = write_bitmap_pixels(&mut b, &vec![7u8; 64]);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn bitmapregion_write_pixels32_matches_write_bitmap_pixels32() {
        let mut a = test_region();
        let mut b = test_region();
        let ra = a.write_pixels32(&vec![0x11223344u32; 16]);
        let rb = write_bitmap_pixels32(&mut b, &vec![0x11223344u32; 16]);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }
}

fn blend_channel(mode: BitmapCompositeMode, cb: f32, cs: f32) -> f32 {
    match mode {
        BitmapCompositeMode::Multiply => (cb * cs) / 255.0,
        BitmapCompositeMode::Screen => cb + cs - (cb * cs) / 255.0,
        BitmapCompositeMode::Add => (cb + cs).min(255.0),
        BitmapCompositeMode::Subtract => (cb - cs).max(0.0),
        BitmapCompositeMode::Darken => cb.min(cs),
        BitmapCompositeMode::Lighten => cb.max(cs),
        BitmapCompositeMode::Difference => (cb - cs).abs(),
        BitmapCompositeMode::Exclusion => cb + cs - (2.0 * cb * cs) / 255.0,
        BitmapCompositeMode::Overlay => {
            if cb < 128.0 {
                (2.0 * cb * cs) / 255.0
            } else {
                255.0 - (2.0 * (255.0 - cb) * (255.0 - cs)) / 255.0
            }
        }
        BitmapCompositeMode::HardLight => {
            if cs < 128.0 {
                (2.0 * cb * cs) / 255.0
            } else {
                255.0 - (2.0 * (255.0 - cb) * (255.0 - cs)) / 255.0
            }
        }
        BitmapCompositeMode::SoftLight => soft_light_channel(cb, cs),
        BitmapCompositeMode::ColorDodge => {
            if cs >= 255.0 {
                255.0
            } else {
                ((cb * 255.0) / (255.0 - cs)).min(255.0)
            }
        }
        BitmapCompositeMode::ColorBurn => {
            if cs <= 0.0 {
                0.0
            } else {
                255.0 - (((255.0 - cb) * 255.0) / cs).min(255.0)
            }
        }
        BitmapCompositeMode::Invert => 255.0 - cb,
        _ => cs,
    }
}

/// Composites pixels over dest using the given mode.
// flight-lint: allow(conform-array) pixel ruling (agents/rust/ir-vocabulary.md): no clamped array in the IR; TS Uint8ClampedArray pixel buffers become Uint8Array, stores clamp explicitly
pub fn composite_bitmap_pixels(
    dest: &mut BitmapRegion,
    pixels: &Uint8Array,
    mode: BitmapCompositeMode,
) {
    for py in 0..dest.height {
        let y = dest.y + py;
        if y < 0 || y >= dest.bitmap.height as i32 {
            continue;
        }
        for px in 0..dest.width {
            let x = dest.x + px;
            if x < 0 || x >= dest.bitmap.width as i32 {
                continue;
            }
            let si = (py as usize * dest.width as usize + px as usize) * 4;
            let di = (y as usize * dest.bitmap.width as usize + x as usize) * 4;
            composite_pixel_into(
                &mut dest.bitmap.data,
                di,
                pixels[si],
                pixels[si + 1],
                pixels[si + 2],
                pixels[si + 3],
                mode,
            );
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

/// Composites source region over dest region.
pub fn composite_bitmap_region(
    dest: &mut BitmapRegion,
    source: &BitmapRegion,
    mode: BitmapCompositeMode,
) {
    let sw = dest.width.min(source.width);
    let sh = dest.height.min(source.height);
    let sd = source.bitmap.data.clone();
    for py in 0..sh {
        let source_y = source.y + py;
        let y = dest.y + py;
        if source_y < 0
            || source_y >= source.bitmap.height as i32
            || y < 0
            || y >= dest.bitmap.height as i32
        {
            continue;
        }
        for px in 0..sw {
            let source_x = source.x + px;
            let x = dest.x + px;
            if source_x < 0
                || source_x >= source.bitmap.width as i32
                || x < 0
                || x >= dest.bitmap.width as i32
            {
                continue;
            }
            let si = (source_y as usize * source.bitmap.width as usize + source_x as usize) * 4;
            let di = (y as usize * dest.bitmap.width as usize + x as usize) * 4;
            composite_pixel_into(
                &mut dest.bitmap.data,
                di,
                sd[si],
                sd[si + 1],
                sd[si + 2],
                sd[si + 3],
                mode,
            );
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

fn composite_pixel_into(
    dest: &mut [u8],
    di: usize,
    r: u8,
    g: u8,
    b: u8,
    a: u8,
    mode: BitmapCompositeMode,
) {
    let src_a = a as f32 / 255.0;
    let dst_a = dest[di + 3] as f32 / 255.0;
    let (fa, fb) = porter_duff_factors(mode, src_a, dst_a);
    let out_a = fa * src_a + fb * dst_a;
    if out_a <= 0.0 {
        dest[di] = 0;
        dest[di + 1] = 0;
        dest[di + 2] = 0;
        dest[di + 3] = 0;
        return;
    }
    let cb_r = dest[di] as f32;
    let cb_g = dest[di + 1] as f32;
    let cb_b = dest[di + 2] as f32;
    let cs_r = (1.0 - dst_a) * r as f32 + dst_a * blend_channel(mode, cb_r, r as f32);
    let cs_g = (1.0 - dst_a) * g as f32 + dst_a * blend_channel(mode, cb_g, g as f32);
    let cs_b = (1.0 - dst_a) * b as f32 + dst_a * blend_channel(mode, cb_b, b as f32);
    dest[di] = ((fa * src_a * cs_r + fb * dst_a * cb_r) / out_a).round() as u8;
    dest[di + 1] = ((fa * src_a * cs_g + fb * dst_a * cb_g) / out_a).round() as u8;
    dest[di + 2] = ((fa * src_a * cs_b + fb * dst_a * cb_b) / out_a).round() as u8;
    dest[di + 3] = (out_a * 255.0).round() as u8;
}

/// Extracts source region pixels into out buffer.
// flight-lint: allow(conform-array) pixel ruling (agents/rust/ir-vocabulary.md): no clamped array in the IR; TS Uint8ClampedArray pixel buffers become Uint8Array, stores clamp explicitly
pub fn extract_bitmap_pixels(out: &mut [u8], source: &BitmapRegion) {
    for py in 0..source.height {
        let source_y = source.y + py;
        if source_y < 0 || source_y >= source.bitmap.height as i32 {
            continue;
        }
        for px in 0..source.width {
            let source_x = source.x + px;
            if source_x < 0 || source_x >= source.bitmap.width as i32 {
                continue;
            }
            let si = (source_y as usize * source.bitmap.width as usize + source_x as usize) * 4;
            let di = (py as usize * source.width as usize + px as usize) * 4;
            out[di] = source.bitmap.data[si];
            out[di + 1] = source.bitmap.data[si + 1];
            out[di + 2] = source.bitmap.data[si + 2];
            out[di + 3] = source.bitmap.data[si + 3];
        }
    }
}

/// Extracts source region as packed 0xRRGGBBAA u32 values.
pub fn extract_bitmap_pixels32(out: &mut [u32], source: &BitmapRegion) {
    for py in 0..source.height {
        let source_y = source.y + py;
        if source_y < 0 || source_y >= source.bitmap.height as i32 {
            continue;
        }
        for px in 0..source.width {
            let source_x = source.x + px;
            if source_x < 0 || source_x >= source.bitmap.width as i32 {
                continue;
            }
            let si = (source_y as usize * source.bitmap.width as usize + source_x as usize) * 4;
            let d = &source.bitmap.data;
            out[py as usize * source.width as usize + px as usize] = ((d[si] as u32) << 24)
                | ((d[si + 1] as u32) << 16)
                | ((d[si + 2] as u32) << 8)
                | (d[si + 3] as u32);
        }
    }
}

fn porter_duff_factors(mode: BitmapCompositeMode, src_a: f32, dst_a: f32) -> (f32, f32) {
    match mode {
        BitmapCompositeMode::DestinationOver => (1.0 - dst_a, 1.0),
        BitmapCompositeMode::SourceIn => (dst_a, 0.0),
        BitmapCompositeMode::DestinationIn => (0.0, src_a),
        BitmapCompositeMode::SourceOut => (1.0 - dst_a, 0.0),
        BitmapCompositeMode::DestinationOut => (0.0, 1.0 - src_a),
        BitmapCompositeMode::SourceAtop => (dst_a, 1.0 - src_a),
        BitmapCompositeMode::DestinationAtop => (1.0 - dst_a, src_a),
        BitmapCompositeMode::Xor => (1.0 - dst_a, 1.0 - src_a),
        BitmapCompositeMode::Copy => (1.0, 0.0),
        BitmapCompositeMode::Clear => (0.0, 0.0),
        _ => (1.0, 1.0 - src_a),
    }
}

fn soft_light_channel(cb: f32, cs: f32) -> f32 {
    let b = cb / 255.0;
    let s = cs / 255.0;
    let d = if b <= 0.25 {
        ((16.0 * b - 12.0) * b + 4.0) * b
    } else {
        b.sqrt()
    };
    let out = if s <= 0.5 {
        b - (1.0 - 2.0 * s) * b * (1.0 - b)
    } else {
        b + (2.0 * s - 1.0) * (d - b)
    };
    out * 255.0
}

/// Writes pixels into dest, overwriting content.
// flight-lint: allow(conform-array) pixel ruling (agents/rust/ir-vocabulary.md): no clamped array in the IR; TS Uint8ClampedArray pixel buffers become Uint8Array, stores clamp explicitly
pub fn write_bitmap_pixels(dest: &mut BitmapRegion, pixels: &Uint8Array) {
    for py in 0..dest.height {
        let y = dest.y + py;
        if y < 0 || y >= dest.bitmap.height as i32 {
            continue;
        }
        for px in 0..dest.width {
            let x = dest.x + px;
            if x < 0 || x >= dest.bitmap.width as i32 {
                continue;
            }
            let si = (py as usize * dest.width as usize + px as usize) * 4;
            let di = (y as usize * dest.bitmap.width as usize + x as usize) * 4;
            dest.bitmap.data[di] = pixels[si];
            dest.bitmap.data[di + 1] = pixels[si + 1];
            dest.bitmap.data[di + 2] = pixels[si + 2];
            dest.bitmap.data[di + 3] = pixels[si + 3];
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

/// Writes packed 0xRRGGBBAA pixels into dest.
pub fn write_bitmap_pixels32(dest: &mut BitmapRegion, pixels: &[u32]) {
    for py in 0..dest.height {
        let y = dest.y + py;
        if y < 0 || y >= dest.bitmap.height as i32 {
            continue;
        }
        for px in 0..dest.width {
            let x = dest.x + px;
            if x < 0 || x >= dest.bitmap.width as i32 {
                continue;
            }
            let color = pixels[py as usize * dest.width as usize + px as usize];
            let di = (y as usize * dest.bitmap.width as usize + x as usize) * 4;
            dest.bitmap.data[di] = ((color >> 24) & 0xff) as u8;
            dest.bitmap.data[di + 1] = ((color >> 16) & 0xff) as u8;
            dest.bitmap.data[di + 2] = ((color >> 8) & 0xff) as u8;
            dest.bitmap.data[di + 3] = (color & 0xff) as u8;
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

impl BitmapRegion {
    pub fn composite_pixels(&mut self, pixels: &Uint8Array, mode: BitmapCompositeMode) {
        return composite_bitmap_pixels(self, pixels, mode);
    }

    pub fn composite_region(&mut self, source: &BitmapRegion, mode: BitmapCompositeMode) {
        return composite_bitmap_region(self, source, mode);
    }

    pub fn write_pixels(&mut self, pixels: &Uint8Array) {
        return write_bitmap_pixels(self, pixels);
    }

    pub fn write_pixels32(&mut self, pixels: &[u32]) {
        return write_bitmap_pixels32(self, pixels);
    }
}
