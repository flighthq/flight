//! 4×5 color matrix filter and builder helpers.

use flighthq_types::SurfaceRegion;

/// Applies a 4×5 color matrix to `source` and writes into `out`.
/// `out` must be at least `source.width * source.height * 4` bytes.
///
/// Safe to pass `source.surface.data` as `out` when the region covers the
/// full surface — each pixel's input channels are read before any channel of
/// that pixel is written.
pub fn color_matrix_surface(out: &mut [u8], source: &SurfaceRegion, matrix: &[f32; 20]) {
    let surface_width = source.surface.width;
    let surface_height = source.surface.height;
    let region_width = source.width;
    for py in 0..source.height {
        let source_y = source.y + py;
        if source_y >= surface_height {
            continue;
        }
        for px in 0..source.width {
            let source_x = source.x + px;
            if source_x >= surface_width {
                continue;
            }
            let si = ((source_y * surface_width + source_x) * 4) as usize;
            let di = ((py * region_width + px) * 4) as usize;
            // Read all input channels before writing, so `out` may alias source.
            let r = source.surface.data[si] as f32;
            let g = source.surface.data[si + 1] as f32;
            let b = source.surface.data[si + 2] as f32;
            let a = source.surface.data[si + 3] as f32;
            out[di] = clamp_byte(
                r * matrix[0] + g * matrix[1] + b * matrix[2] + a * matrix[3] + matrix[4],
            );
            out[di + 1] = clamp_byte(
                r * matrix[5] + g * matrix[6] + b * matrix[7] + a * matrix[8] + matrix[9],
            );
            out[di + 2] = clamp_byte(
                r * matrix[10] + g * matrix[11] + b * matrix[12] + a * matrix[13] + matrix[14],
            );
            out[di + 3] = clamp_byte(
                r * matrix[15] + g * matrix[16] + b * matrix[17] + a * matrix[18] + matrix[19],
            );
        }
    }
}

/// Writes a brightness color matrix into `out`. Multiplies RGB by `amount`
/// (CSS `brightness()` semantics): 1.0 is identity, 0.0 is black, >1.0 brightens.
pub fn build_surface_brightness_color_matrix(out: &mut [f32; 20], amount: f32) {
    #[rustfmt::skip]
    set_color_matrix(out, [
        amount, 0.0, 0.0, 0.0, 0.0,
        0.0, amount, 0.0, 0.0, 0.0,
        0.0, 0.0, amount, 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ]);
}

/// Writes a contrast color matrix into `out`. Scales RGB around the midpoint
/// (CSS `contrast()` semantics): 1.0 is identity, 0.0 is flat grey, >1.0 raises
/// contrast.
pub fn build_surface_contrast_color_matrix(out: &mut [f32; 20], amount: f32) {
    let t = 127.5 * (1.0 - amount);
    #[rustfmt::skip]
    set_color_matrix(out, [
        amount, 0.0, 0.0, 0.0, t,
        0.0, amount, 0.0, 0.0, t,
        0.0, 0.0, amount, 0.0, t,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ]);
}

/// Writes a grayscale color matrix into `out`. Equivalent to
/// `build_surface_saturation_color_matrix(out, 0.0)`; uses the W3C luma
/// coefficients.
pub fn build_surface_grayscale_color_matrix(out: &mut [f32; 20]) {
    build_surface_saturation_color_matrix(out, 0.0);
}

/// Writes a hue-rotation color matrix into `out`. `degrees` rotates hue around
/// the luma axis (CSS `hue-rotate()` semantics, W3C coefficients). 0° is
/// identity; 180° inverts hue.
pub fn build_surface_hue_rotation_color_matrix(out: &mut [f32; 20], degrees: f32) {
    let radians = degrees * std::f32::consts::PI / 180.0;
    let c = radians.cos();
    let s = radians.sin();
    #[rustfmt::skip]
    set_color_matrix(out, [
        0.213 + c * 0.787 - s * 0.213,
        0.715 - c * 0.715 - s * 0.715,
        0.072 - c * 0.072 + s * 0.928,
        0.0,
        0.0,
        0.213 - c * 0.213 + s * 0.143,
        0.715 + c * 0.285 + s * 0.14,
        0.072 - c * 0.072 - s * 0.283,
        0.0,
        0.0,
        0.213 - c * 0.213 - s * 0.787,
        0.715 - c * 0.715 + s * 0.715,
        0.072 + c * 0.928 + s * 0.072,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        1.0,
        0.0,
    ]);
}

/// Writes an invert color matrix into `out`. Inverts RGB (`255 - channel`);
/// alpha is preserved.
pub fn build_surface_invert_color_matrix(out: &mut [f32; 20]) {
    #[rustfmt::skip]
    set_color_matrix(out, [
        -1.0, 0.0, 0.0, 0.0, 255.0,
        0.0, -1.0, 0.0, 0.0, 255.0,
        0.0, 0.0, -1.0, 0.0, 255.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ]);
}

/// Writes a saturation color matrix into `out`. `amount` is 1.0 for identity,
/// 0.0 for grayscale, >1.0 for oversaturated (CSS `saturate()` semantics, W3C
/// luma coefficients).
pub fn build_surface_saturation_color_matrix(out: &mut [f32; 20], amount: f32) {
    let inv = 1.0 - amount;
    let r = LUMA_R * inv;
    let g = LUMA_G * inv;
    let b = LUMA_B * inv;
    #[rustfmt::skip]
    set_color_matrix(out, [
        r + amount, g, b, 0.0, 0.0,
        r, g + amount, b, 0.0, 0.0,
        r, g, b + amount, 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ]);
}

/// Writes a sepia color matrix into `out`, matching CSS `sepia(1)`.
pub fn build_surface_sepia_color_matrix(out: &mut [f32; 20]) {
    #[rustfmt::skip]
    set_color_matrix(out, [
        0.393, 0.769, 0.189, 0.0, 0.0,
        0.349, 0.686, 0.168, 0.0, 0.0,
        0.272, 0.534, 0.131, 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ]);
}

/// Composes two 4×5 color matrices into `out`: the result applies `first`, then
/// `second`. `out` must not alias `first` or `second`.
pub fn concat_surface_color_matrix(out: &mut [f32; 20], first: &[f32; 20], second: &[f32; 20]) {
    for row in 0..4 {
        for col in 0..5 {
            let mut sum = if col == 4 { second[row * 5 + 4] } else { 0.0 };
            for k in 0..4 {
                let factor = if col == 4 {
                    first[k * 5 + 4]
                } else {
                    first[k * 5 + col]
                };
                sum += second[row * 5 + k] * factor;
            }
            out[row * 5 + col] = sum;
        }
    }
}

/// Writes the identity color matrix into `out`.
pub fn set_surface_color_matrix_identity(out: &mut [f32; 20]) {
    #[rustfmt::skip]
    set_color_matrix(out, [
        1.0, 0.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ]);
}

// W3C luma coefficients (matching CSS saturate/grayscale), so the CPU result
// agrees with the eventual CSS filter backend.
const LUMA_R: f32 = 0.213;
const LUMA_G: f32 = 0.715;
const LUMA_B: f32 = 0.072;

fn clamp_byte(value: f32) -> u8 {
    value.round().clamp(0.0, 255.0) as u8
}

fn set_color_matrix(out: &mut [f32; 20], values: [f32; 20]) {
    *out = values;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::create_surface;
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

    // Build a 1x1 surface, apply `matrix`, and return its RGBA bytes.
    fn apply_to(rgba: u32, matrix: &[f32; 20]) -> [u8; 4] {
        let surface = create_surface(1, 1, rgba);
        let mut out = vec![0_u8; 4];
        color_matrix_surface(&mut out, &region(surface), matrix);
        [out[0], out[1], out[2], out[3]]
    }

    #[test]
    fn color_matrix_surface_applies_matrix() {
        let source = create_surface(1, 1, 0x204060ff);
        let mut out = vec![0_u8; 4];
        #[rustfmt::skip]
        let m = [
            0.0, 0.0, 0.0, 0.0, 10.0,
            0.0, 0.0, 0.0, 0.0, 20.0,
            0.0, 0.0, 0.0, 0.0, 30.0,
            0.0, 0.0, 0.0, 1.0, 0.0,
        ];
        color_matrix_surface(&mut out, &region(source), &m);
        assert_eq!(out[0], 10);
        assert_eq!(out[1], 20);
        assert_eq!(out[2], 30);
        assert_eq!(out[3], 0xff);
    }

    #[test]
    fn color_matrix_surface_identity() {
        let mut m = [0.0_f32; 20];
        set_surface_color_matrix_identity(&mut m);
        let out = apply_to(0xc86432ff, &m);
        assert_eq!(out, [200, 100, 50, 0xff]);
    }

    #[test]
    fn color_matrix_surface_clamps() {
        let source = create_surface(1, 1, 0xff0000ff);
        let mut out = vec![0_u8; 4];
        #[rustfmt::skip]
        let m = [
            10.0, 0.0, 0.0, 0.0, 100.0,
            0.0, 0.0, 0.0, 0.0, -50.0,
            0.0, 0.0, 0.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 1.0, 0.0,
        ];
        color_matrix_surface(&mut out, &region(source), &m);
        assert_eq!(out[0], 255);
        assert_eq!(out[1], 0);
    }

    #[test]
    fn color_matrix_surface_translate_offsets() {
        let source = create_surface(1, 1, 0x010203ff);
        let mut out = vec![0_u8; 4];
        #[rustfmt::skip]
        let m = [
            1.0, 0.0, 0.0, 0.0, 10.0,
            0.0, 1.0, 0.0, 0.0, 20.0,
            0.0, 0.0, 1.0, 0.0, 30.0,
            0.0, 0.0, 0.0, 1.0, 0.0,
        ];
        color_matrix_surface(&mut out, &region(source), &m);
        assert_eq!(out[0], 11);
        assert_eq!(out[1], 22);
        assert_eq!(out[2], 33);
        assert_eq!(out[3], 0xff);
    }

    #[test]
    fn color_matrix_surface_skips_out_of_bounds() {
        let source = create_surface(1, 1, 0xff0000ff);
        let mut out = vec![0_u8; 4 * 4];
        let mut identity = [0.0_f32; 20];
        set_surface_color_matrix_identity(&mut identity);
        let r = SurfaceRegion {
            surface: source,
            x: 0,
            y: 0,
            width: 2,
            height: 2,
        };
        color_matrix_surface(&mut out, &r, &identity);
        // Only the top-left pixel of the 2x2 region is in-bounds.
        assert_eq!(out[0], 0xff);
        let i = (2 + 1) * 4;
        assert_eq!(out[i], 0);
    }

    #[test]
    fn build_surface_brightness_color_matrix_identity_at_one() {
        let mut m = [0.0_f32; 20];
        build_surface_brightness_color_matrix(&mut m, 1.0);
        let out = apply_to(0xc86432ff, &m);
        assert_eq!(out, [200, 100, 50, 0xff]);
    }

    #[test]
    fn build_surface_brightness_color_matrix_halves() {
        let mut m = [0.0_f32; 20];
        build_surface_brightness_color_matrix(&mut m, 0.5);
        let out = apply_to(0xc86432ff, &m); // R=200 G=100 B=50
        assert_eq!(out, [100, 50, 25, 0xff]);
    }

    #[test]
    fn build_surface_contrast_color_matrix_zero_is_mid_grey() {
        let mut m = [0.0_f32; 20];
        build_surface_contrast_color_matrix(&mut m, 0.0);
        let out = apply_to(0xc80000ff, &m);
        assert_eq!(out[0], 128);
        assert_eq!(out[1], 128);
    }

    #[test]
    fn build_surface_grayscale_color_matrix_matches_saturation_zero() {
        let mut m = [0.0_f32; 20];
        build_surface_grayscale_color_matrix(&mut m);
        let out = apply_to(0xff0000ff, &m);
        assert_eq!(out[0], 54); // round(0.213 * 255)
        assert_eq!(out[1], 54);
        assert_eq!(out[2], 54);
    }

    #[test]
    fn build_surface_hue_rotation_color_matrix_grey_unchanged() {
        let mut m = [0.0_f32; 20];
        build_surface_hue_rotation_color_matrix(&mut m, 70.7);
        let out = apply_to(0x808080ff, &m);
        assert_eq!(out[0], 128);
        assert_eq!(out[1], 128);
        assert_eq!(out[2], 128);
    }

    #[test]
    fn build_surface_hue_rotation_color_matrix_identity_at_zero() {
        let mut m = [0.0_f32; 20];
        build_surface_hue_rotation_color_matrix(&mut m, 0.0);
        let out = apply_to(0xc86432ff, &m);
        assert_eq!(out[0], 200);
        assert_eq!(out[1], 100);
        assert_eq!(out[2], 50);
    }

    #[test]
    fn build_surface_invert_color_matrix_inverts_rgb() {
        let mut m = [0.0_f32; 20];
        build_surface_invert_color_matrix(&mut m);
        let out = apply_to(0xc83200ff, &m); // R=200 G=50 B=0
        assert_eq!(out[0], 55);
        assert_eq!(out[1], 205);
        assert_eq!(out[2], 255);
        assert_eq!(out[3], 0xff);
    }

    #[test]
    fn build_surface_saturation_color_matrix_one_is_identity() {
        let mut m = [0.0_f32; 20];
        build_surface_saturation_color_matrix(&mut m, 1.0);
        let out = apply_to(0xc86432ff, &m);
        assert_eq!(out[0], 200);
        assert_eq!(out[1], 100);
        assert_eq!(out[2], 50);
    }

    #[test]
    fn build_surface_sepia_color_matrix_maps_red() {
        let mut m = [0.0_f32; 20];
        build_surface_sepia_color_matrix(&mut m);
        let out = apply_to(0xff0000ff, &m);
        assert_eq!(out[0], 100);
        assert_eq!(out[1], 89);
        assert_eq!(out[2], 69);
    }

    #[test]
    fn concat_surface_color_matrix_composes() {
        let mut bright2 = [0.0_f32; 20];
        let mut half = [0.0_f32; 20];
        build_surface_brightness_color_matrix(&mut bright2, 2.0);
        build_surface_brightness_color_matrix(&mut half, 0.5);
        let mut out = [0.0_f32; 20];
        concat_surface_color_matrix(&mut out, &bright2, &half);
        let pixel = apply_to(0xc86432ff, &out);
        assert_eq!(pixel[0], 200);
        assert_eq!(pixel[1], 100);
        assert_eq!(pixel[2], 50);
    }

    #[test]
    fn concat_surface_color_matrix_carries_offset() {
        let mut identity = [0.0_f32; 20];
        let mut invert = [0.0_f32; 20];
        set_surface_color_matrix_identity(&mut identity);
        build_surface_invert_color_matrix(&mut invert);
        let mut out = [0.0_f32; 20];
        concat_surface_color_matrix(&mut out, &identity, &invert);
        let pixel = apply_to(0xc80000ff, &out); // R=200 -> 55
        assert_eq!(pixel[0], 55);
    }

    #[test]
    fn concat_surface_color_matrix_identity_twice() {
        let mut a = [0.0_f32; 20];
        let mut b = [0.0_f32; 20];
        set_surface_color_matrix_identity(&mut a);
        set_surface_color_matrix_identity(&mut b);
        let mut out = [0.0_f32; 20];
        concat_surface_color_matrix(&mut out, &a, &b);
        let pixel = apply_to(0xc86432ff, &out);
        assert_eq!(pixel, [200, 100, 50, 0xff]);
    }

    #[test]
    fn set_surface_color_matrix_identity_is_identity() {
        let mut m = [0.0_f32; 20];
        set_surface_color_matrix_identity(&mut m);
        let out = apply_to(0xc86432ff, &m);
        assert_eq!(out, [200, 100, 50, 0xff]);
    }
}
