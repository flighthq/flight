use flight_materials::ColorScaleBias;

use crate::bitmap::invalidate_bitmap;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use flight_materials::ColorScaleBias;
    use flight_materials::contract::create_color_scale_bias;

    use crate::contract::*;

    fn test_scale_bias() -> ColorScaleBias {
        let mut out = create_color_scale_bias(None);
        out.red_scale = 0.5;
        out.blue_scale = 1.5;
        out.red_bias = 0.1;
        out.blue_bias = -0.1;
        return out;
    }

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
    fn bitmap_scroll_matches_scroll_bitmap() {
        let mut a = test_bitmap();
        let mut b = test_bitmap();
        let ra = a.scroll(1, 1);
        let rb = scroll_bitmap(&mut b, 1, 1);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn bitmapregion_apply_color_scale_bias_matches_apply_bitmap_color_scale_bias() {
        let mut a = test_region();
        let mut b = test_region();
        let ra = a.apply_color_scale_bias(&test_region(), &test_scale_bias());
        let rb = apply_bitmap_color_scale_bias(&mut b, &test_region(), &test_scale_bias());
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn bitmapregion_apply_threshold_matches_apply_bitmap_threshold() {
        let mut a = test_region();
        let mut b = test_region();
        let ra = a.apply_threshold(
            &test_region(),
            ThresholdOperation::LessThan,
            128,
            0xff0000ff,
            0xff0000ff,
            true,
        );
        let rb = apply_bitmap_threshold(
            &mut b,
            &test_region(),
            ThresholdOperation::LessThan,
            128,
            0xff0000ff,
            0xff0000ff,
            true,
        );
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn bitmapregion_merge_matches_merge_bitmap() {
        let mut a = test_region();
        let mut b = test_region();
        let ra = a.merge(&test_region(), 0.5, 0.5, 0.5, 0.5);
        let rb = merge_bitmap(&mut b, &test_region(), 0.5, 0.5, 0.5, 0.5);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }
}

/// Applies normalized-linear color scale/bias to `source`, writing into `dest`.
pub fn apply_bitmap_color_scale_bias(
    dest: &mut BitmapRegion,
    source: &BitmapRegion,
    ct: &ColorScaleBias,
) {
    let w = dest.width.min(source.width);
    let h = dest.height.min(source.height);
    let sd = source.bitmap.data.clone();
    let s_bw = source.bitmap.width as i32;
    let d_bw = dest.bitmap.width as i32;
    for py in 0..h {
        let sy = source.y + py;
        let dy = dest.y + py;
        if sy < 0 || sy >= source.bitmap.height as i32 || dy < 0 || dy >= dest.bitmap.height as i32
        {
            continue;
        }
        for px in 0..w {
            let sx = source.x + px;
            let dx = dest.x + px;
            if sx < 0 || sx >= s_bw || dx < 0 || dx >= d_bw {
                continue;
            }
            let si = (sy as usize * s_bw as usize + sx as usize) * 4;
            let di = (dy as usize * d_bw as usize + dx as usize) * 4;
            let r = sd[si] as f32;
            let g = sd[si + 1] as f32;
            let b = sd[si + 2] as f32;
            let a = sd[si + 3] as f32;
            dest.bitmap.data[di] = (r * ct.red_scale + ct.red_bias * 255.0)
                .round()
                .max(0.0)
                .min(255.0) as u8;
            dest.bitmap.data[di + 1] = (g * ct.green_scale + ct.green_bias * 255.0)
                .round()
                .max(0.0)
                .min(255.0) as u8;
            dest.bitmap.data[di + 2] = (b * ct.blue_scale + ct.blue_bias * 255.0)
                .round()
                .max(0.0)
                .min(255.0) as u8;
            dest.bitmap.data[di + 3] = (a * ct.alpha_scale + ct.alpha_bias * 255.0)
                .round()
                .max(0.0)
                .min(255.0) as u8;
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

/// Tests each pixel and writes `color` where the test passes.
pub fn apply_bitmap_threshold(
    dest: &mut BitmapRegion,
    source: &BitmapRegion,
    operation: ThresholdOperation,
    threshold_value: u32,
    color: u32,
    mask: u32,
    copy_source: bool,
) -> u32 {
    let w = dest.width.min(source.width);
    let h = dest.height.min(source.height);
    let sd = source.bitmap.data.clone();
    let s_bw = source.bitmap.width as i32;
    let d_bw = dest.bitmap.width as i32;
    let mut changed = 0u32;
    for py in 0..h {
        let sy = source.y + py;
        let dy = dest.y + py;
        if sy < 0 || sy >= source.bitmap.height as i32 || dy < 0 || dy >= dest.bitmap.height as i32
        {
            continue;
        }
        for px in 0..w {
            let sx = source.x + px;
            let dx = dest.x + px;
            if sx < 0 || sx >= s_bw || dx < 0 || dx >= d_bw {
                continue;
            }
            let si = (sy as usize * s_bw as usize + sx as usize) * 4;
            let di = (dy as usize * d_bw as usize + dx as usize) * 4;
            let pixel = (((sd[si] as u32) << 24)
                | ((sd[si + 1] as u32) << 16)
                | ((sd[si + 2] as u32) << 8)
                | (sd[si + 3] as u32))
                & mask;
            let passes = compare(pixel, &operation, threshold_value);
            if passes {
                dest.bitmap.data[di] = ((color >> 24) & 0xff) as u8;
                dest.bitmap.data[di + 1] = ((color >> 16) & 0xff) as u8;
                dest.bitmap.data[di + 2] = ((color >> 8) & 0xff) as u8;
                dest.bitmap.data[di + 3] = (color & 0xff) as u8;
                changed += 1;
            } else if copy_source {
                dest.bitmap.data[di] = sd[si];
                dest.bitmap.data[di + 1] = sd[si + 1];
                dest.bitmap.data[di + 2] = sd[si + 2];
                dest.bitmap.data[di + 3] = sd[si + 3];
            }
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
    changed
}

fn compare(a: u32, op: &ThresholdOperation, b: u32) -> bool {
    match op {
        ThresholdOperation::LessThan => a < b,
        ThresholdOperation::LessThanOrEqual => a <= b,
        ThresholdOperation::GreaterThan => a > b,
        ThresholdOperation::GreaterThanOrEqual => a >= b,
        ThresholdOperation::Equal => a == b,
        ThresholdOperation::NotEqual => a != b,
    }
}

/// Blends each channel of `source` into `dest` using per-channel multipliers.
pub fn merge_bitmap(
    dest: &mut BitmapRegion,
    source: &BitmapRegion,
    red_scale: f32,
    green_scale: f32,
    blue_scale: f32,
    alpha_scale: f32,
) {
    let w = dest.width.min(source.width);
    let h = dest.height.min(source.height);
    let sd = source.bitmap.data.clone();
    let s_bw = source.bitmap.width as i32;
    let d_bw = dest.bitmap.width as i32;
    for py in 0..h {
        let sy = source.y + py;
        let dy = dest.y + py;
        if sy < 0 || sy >= source.bitmap.height as i32 || dy < 0 || dy >= dest.bitmap.height as i32
        {
            continue;
        }
        for px in 0..w {
            let sx = source.x + px;
            let dx = dest.x + px;
            if sx < 0 || sx >= s_bw || dx < 0 || dx >= d_bw {
                continue;
            }
            let si = (sy as usize * s_bw as usize + sx as usize) * 4;
            let di = (dy as usize * d_bw as usize + dx as usize) * 4;
            dest.bitmap.data[di] = (sd[si] as f32 * red_scale
                + dest.bitmap.data[di] as f32 * (1.0 - red_scale))
                .round() as u8;
            dest.bitmap.data[di + 1] = (sd[si + 1] as f32 * green_scale
                + dest.bitmap.data[di + 1] as f32 * (1.0 - green_scale))
                .round() as u8;
            dest.bitmap.data[di + 2] = (sd[si + 2] as f32 * blue_scale
                + dest.bitmap.data[di + 2] as f32 * (1.0 - blue_scale))
                .round() as u8;
            dest.bitmap.data[di + 3] = (sd[si + 3] as f32 * alpha_scale
                + dest.bitmap.data[di + 3] as f32 * (1.0 - alpha_scale))
                .round() as u8;
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

/// Scrolls the content of `out` by (dx, dy), wrapping at the edges.
pub fn scroll_bitmap(out: &mut Bitmap, dx: i32, dy: i32) {
    let scratch = out.data.clone();
    let w = out.width as i32;
    let h = out.height as i32;
    for py in 0..h {
        let src_y = ((py - dy) % h + h) % h;
        for px in 0..w {
            let src_x = ((px - dx) % w + w) % w;
            let si = (src_y as usize * w as usize + src_x as usize) * 4;
            let di = (py as usize * w as usize + px as usize) * 4;
            out.data[di] = scratch[si];
            out.data[di + 1] = scratch[si + 1];
            out.data[di + 2] = scratch[si + 2];
            out.data[di + 3] = scratch[si + 3];
        }
    }
    invalidate_bitmap(out);
}

impl Bitmap {
    pub fn scroll(&mut self, dx: i32, dy: i32) {
        return scroll_bitmap(self, dx, dy);
    }
}

impl BitmapRegion {
    pub fn apply_color_scale_bias(&mut self, source: &BitmapRegion, ct: &ColorScaleBias) {
        return apply_bitmap_color_scale_bias(self, source, ct);
    }

    pub fn apply_threshold(
        &mut self,
        source: &BitmapRegion,
        operation: ThresholdOperation,
        threshold_value: u32,
        color: u32,
        mask: u32,
        copy_source: bool,
    ) -> u32 {
        return apply_bitmap_threshold(
            self,
            source,
            operation,
            threshold_value,
            color,
            mask,
            copy_source,
        );
    }

    pub fn merge(
        &mut self,
        source: &BitmapRegion,
        red_scale: f32,
        green_scale: f32,
        blue_scale: f32,
        alpha_scale: f32,
    ) {
        return merge_bitmap(
            self,
            source,
            red_scale,
            green_scale,
            blue_scale,
            alpha_scale,
        );
    }
}
