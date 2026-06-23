//! Displacement map filter — per-pixel warp driven by a map surface.

use flighthq_types::SurfaceRegion;

/// How to handle sample positions that fall outside the source region.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum SurfaceDisplacementMapMode {
    Clamp,
    Color,
    Ignore,
    #[default]
    Wrap,
}

/// Options for `apply_surface_displacement_map_filter`.
#[derive(Clone, Debug)]
pub struct SurfaceDisplacementMapFilterOptions {
    /// Map surface whose channels drive the per-pixel displacement.
    pub map: SurfaceRegion,
    /// Channel index (0=R, 1=G, 2=B, 3=A) of `map` that drives X displacement.
    pub component_x: u8,
    /// Channel index (0=R, 1=G, 2=B, 3=A) of `map` that drives Y displacement.
    pub component_y: u8,
    /// X displacement scale in pixels. A map value of 128 produces no shift.
    pub scale_x: f32,
    /// Y displacement scale in pixels.
    pub scale_y: f32,
    pub mode: SurfaceDisplacementMapMode,
    /// Packed `0xRRGGBBAA` fill used when `mode` is `Color`. Default 0.
    pub fill_color: u32,
}

/// Warps `source` by sampling each output pixel from a displaced source
/// position, writing into `out`. The displacement for pixel `(px, py)` is
/// read from `map` and scaled:
///
/// ```text
/// dx = (map_value_x / 255 - 0.5) * scale_x
/// dy = (map_value_y / 255 - 0.5) * scale_y
/// ```
///
/// Sampling uses bilinear interpolation. `out` must be at least
/// `source.width * source.height * 4` bytes and must NOT alias
/// `source.surface.data`.
pub fn apply_surface_displacement_map_filter(
    out: &mut [u8],
    source: &SurfaceRegion,
    options: &SurfaceDisplacementMapFilterOptions,
) {
    let w = source.width as i64;
    let h = source.height as i64;
    let map = &options.map;
    let component_x = options.component_x as usize;
    let component_y = options.component_y as usize;
    let scale_x = options.scale_x;
    let scale_y = options.scale_y;
    let mode = options.mode;
    let fill_color = options.fill_color;
    let fill_r = ((fill_color >> 24) & 0xff) as u8;
    let fill_g = ((fill_color >> 16) & 0xff) as u8;
    let fill_b = ((fill_color >> 8) & 0xff) as u8;
    let fill_a = (fill_color & 0xff) as u8;

    let wf = w as f32;
    let hf = h as f32;

    for py in 0..h {
        for px in 0..w {
            let di = ((py * w + px) * 4) as usize;
            let map_vx = sample_map_channel(map, px, py, component_x) as f32;
            let map_vy = sample_map_channel(map, px, py, component_y) as f32;
            let raw_sample_x = px as f32 + (map_vx / 255.0 - 0.5) * scale_x;
            let raw_sample_y = py as f32 + (map_vy / 255.0 - 0.5) * scale_y;

            let mut sample_x = raw_sample_x;
            let mut sample_y = raw_sample_y;

            if raw_sample_x < 0.0 || raw_sample_x >= wf || raw_sample_y < 0.0 || raw_sample_y >= hf
            {
                match mode {
                    SurfaceDisplacementMapMode::Wrap => {
                        sample_x = raw_sample_x.rem_euclid(wf);
                        sample_y = raw_sample_y.rem_euclid(hf);
                    }
                    SurfaceDisplacementMapMode::Clamp => {
                        sample_x = raw_sample_x.clamp(0.0, wf - 1.0);
                        sample_y = raw_sample_y.clamp(0.0, hf - 1.0);
                    }
                    SurfaceDisplacementMapMode::Ignore => {
                        sample_x = px as f32;
                        sample_y = py as f32;
                    }
                    SurfaceDisplacementMapMode::Color => {
                        out[di] = fill_r;
                        out[di + 1] = fill_g;
                        out[di + 2] = fill_b;
                        out[di + 3] = fill_a;
                        continue;
                    }
                }
            }

            // Bilinear sample from source at (sample_x, sample_y).
            let x0 = sample_x.floor() as i64;
            let y0 = sample_y.floor() as i64;
            let tx = sample_x - x0 as f32;
            let ty = sample_y - y0 as f32;
            let s_stride = source.surface.width as i64;
            let s_data = &source.surface.data;
            let x0c = source.x as i64 + x0.clamp(0, w - 1);
            let x1c = source.x as i64 + (x0 + 1).clamp(0, w - 1);
            let y0c = source.y as i64 + y0.clamp(0, h - 1);
            let y1c = source.y as i64 + (y0 + 1).clamp(0, h - 1);

            let i00 = ((y0c * s_stride + x0c) * 4) as usize;
            let i10 = ((y0c * s_stride + x1c) * 4) as usize;
            let i01 = ((y1c * s_stride + x0c) * 4) as usize;
            let i11 = ((y1c * s_stride + x1c) * 4) as usize;
            for c in 0..4 {
                let top = s_data[i00 + c] as f32 * (1.0 - tx) + s_data[i10 + c] as f32 * tx;
                let bottom = s_data[i01 + c] as f32 * (1.0 - tx) + s_data[i11 + c] as f32 * tx;
                out[di + c] = (top * (1.0 - ty) + bottom * ty).round() as u8;
            }
        }
    }
}

// A map sample outside the map's bounds returns 128 (neutral — no displacement).
fn sample_map_channel(map: &SurfaceRegion, px: i64, py: i64, component: usize) -> u8 {
    let mx = map.x as i64 + px;
    let my = map.y as i64 + py;
    if mx < 0 || mx >= map.surface.width as i64 || my < 0 || my >= map.surface.height as i64 {
        return 128;
    }
    map.surface.data[((my * map.surface.width as i64 + mx) * 4) as usize + component]
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_surface::create_surface;
    use flighthq_types::SurfaceRegion;

    fn region(surface: flighthq_types::Surface) -> SurfaceRegion {
        let width = surface.width;
        let height = surface.height;
        SurfaceRegion {
            surface,
            x: 0,
            y: 0,
            width,
            height,
        }
    }

    // A 3x1 strip: red | green | blue.
    fn rgb_strip() -> flighthq_types::Surface {
        let mut s = create_surface(3, 1, 0);
        s.data
            .copy_from_slice(&[255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
        s
    }

    fn neutral_map(w: u32, value: u8) -> SurfaceRegion {
        let mut m = create_surface(w, 1, 0);
        m.data.iter_mut().for_each(|v| *v = value);
        region(m)
    }

    #[test]
    fn apply_surface_displacement_map_filter_zero_scale_is_copy() {
        let source = rgb_strip();
        let map = neutral_map(3, 128);
        let mut out = vec![0_u8; 12];
        let options = SurfaceDisplacementMapFilterOptions {
            map,
            component_x: 0,
            component_y: 1,
            scale_x: 0.0,
            scale_y: 0.0,
            mode: SurfaceDisplacementMapMode::Clamp,
            fill_color: 0,
        };
        apply_surface_displacement_map_filter(&mut out, &region(source), &options);
        assert_eq!(out[0], 255); // px0 = red
        assert_eq!(out[4 + 1], 255); // px1 = green
        assert_eq!(out[8 + 2], 255); // px2 = blue
    }

    #[test]
    fn apply_surface_displacement_map_filter_clamp_mode() {
        let source = rgb_strip();
        let mut map_s = create_surface(3, 1, 0);
        map_s.data[0] = 255;
        map_s.data[4] = 255;
        map_s.data[8] = 255;
        let options = SurfaceDisplacementMapFilterOptions {
            map: region(map_s),
            component_x: 0,
            component_y: 1,
            scale_x: 2.0,
            scale_y: 0.0,
            mode: SurfaceDisplacementMapMode::Clamp,
            fill_color: 0,
        };
        let mut out = vec![0_u8; 12];
        apply_surface_displacement_map_filter(&mut out, &region(source), &options);
        // px0←src1 (green), px1←src2 (blue), px2←src3 oob clamped to src2 (blue).
        assert_eq!(out[1], 255); // green channel of px0
        assert_eq!(out[4 + 2], 255); // blue channel of px1
        assert_eq!(out[8 + 2], 255); // blue channel of px2 (clamped)
    }

    #[test]
    fn apply_surface_displacement_map_filter_color_mode() {
        let source = rgb_strip();
        let options = SurfaceDisplacementMapFilterOptions {
            map: neutral_map(3, 255),
            component_x: 0,
            component_y: 1,
            scale_x: 4.0,
            scale_y: 0.0,
            mode: SurfaceDisplacementMapMode::Color,
            fill_color: 0xff00ffff,
        };
        let mut out = vec![0_u8; 12];
        apply_surface_displacement_map_filter(&mut out, &region(source), &options);
        // px2 displaces to x=4 (out of range) → magenta fill.
        assert_eq!(out[2 * 4], 0xff);
        assert_eq!(out[2 * 4 + 1], 0);
        assert_eq!(out[2 * 4 + 2], 0xff);
        assert_eq!(out[2 * 4 + 3], 255);
    }

    #[test]
    fn apply_surface_displacement_map_filter_ignore_mode() {
        let source = rgb_strip();
        let options = SurfaceDisplacementMapFilterOptions {
            map: neutral_map(3, 255),
            component_x: 0,
            component_y: 1,
            scale_x: 4.0,
            scale_y: 0.0,
            mode: SurfaceDisplacementMapMode::Ignore,
            fill_color: 0,
        };
        let mut out = vec![0_u8; 12];
        apply_surface_displacement_map_filter(&mut out, &region(source), &options);
        // px2 displaces out of range → keeps src2 (blue) unchanged.
        assert_eq!(out[2 * 4 + 2], 255);
        assert_eq!(out[2 * 4 + 3], 255);
    }

    #[test]
    fn apply_surface_displacement_map_filter_honors_region_offset() {
        let mut source = create_surface(4, 1, 0);
        source.data.copy_from_slice(&[
            255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
        ]);
        let region_src = SurfaceRegion {
            surface: source,
            x: 1,
            y: 0,
            width: 2,
            height: 1,
        };
        let options = SurfaceDisplacementMapFilterOptions {
            map: neutral_map(2, 128),
            component_x: 0,
            component_y: 1,
            scale_x: 0.0,
            scale_y: 0.0,
            mode: SurfaceDisplacementMapMode::Wrap,
            fill_color: 0,
        };
        let mut out = vec![0_u8; 8];
        apply_surface_displacement_map_filter(&mut out, &region_src, &options);
        assert_eq!(out[1], 255); // green from source[1]
        assert_eq!(out[4 + 2], 255); // blue from source[2]
    }
}
