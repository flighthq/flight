//! Box blur, Gaussian blur, and separable pass primitives.

use flighthq_surface::extract_surface_pixels;
use flighthq_types::SurfaceRegion;

/// Options for `apply_surface_box_blur_filter`.
#[derive(Clone, Debug)]
pub struct SurfaceBoxBlurFilterOptions {
    pub radius_x: u32,
    pub radius_y: u32,
    /// Number of H+V pass pairs. Multiple passes approximate a Gaussian.
    pub passes: u32,
}

impl Default for SurfaceBoxBlurFilterOptions {
    fn default() -> Self {
        Self {
            radius_x: 2,
            radius_y: 2,
            passes: 1,
        }
    }
}

/// Applies a box blur to `source` and writes the result into `out`.
/// `scratch` is a ping-pong buffer; its contents are undefined after the call.
/// Both must be at least `source.width * source.height * 4` bytes.
///
/// Safe to pass `source.surface.data` as `out` when the region covers the full
/// surface.
pub fn apply_surface_box_blur_filter(
    out: &mut [u8],
    scratch: &mut [u8],
    source: &SurfaceRegion,
    options: &SurfaceBoxBlurFilterOptions,
) {
    let radius_x = options.radius_x;
    let radius_y = options.radius_y;
    let passes = options.passes.max(1);
    let width = source.width;
    let height = source.height;
    let len = (width * height * 4) as usize;

    extract_surface_pixels(out, source);

    // `result_in_out` tracks which buffer currently holds the live result.
    let mut result_in_out = true;
    for _ in 0..passes {
        if radius_x > 0 {
            if result_in_out {
                blur_surface_pixels_horizontal(scratch, out, width, height, radius_x);
            } else {
                blur_surface_pixels_horizontal(out, scratch, width, height, radius_x);
            }
            result_in_out = !result_in_out;
        }
        if radius_y > 0 {
            if result_in_out {
                blur_surface_pixels_vertical(scratch, out, width, height, radius_y);
            } else {
                blur_surface_pixels_vertical(out, scratch, width, height, radius_y);
            }
            result_in_out = !result_in_out;
        }
    }

    if !result_in_out {
        out[..len].copy_from_slice(&scratch[..len]);
    }
}

/// Applies a Gaussian blur to `source` and writes the result into `out`.
/// `scratch` is a ping-pong buffer; its contents are undefined after the call.
///
/// `sigma_x` and `sigma_y` are the standard deviation of the Gaussian (CSS
/// `blur(Xpx)` uses sigma = X). `passes` repeats the H+V pass pair.
pub fn apply_surface_gaussian_blur_filter(
    out: &mut [u8],
    scratch: &mut [u8],
    source: &SurfaceRegion,
    sigma_x: f32,
    sigma_y: f32,
    passes: u32,
) {
    let pass_count = passes.max(1);
    let width = source.width;
    let height = source.height;
    let len = (width * height * 4) as usize;

    let radius_x = if sigma_x > 0.0 {
        (sigma_x * 3.0).ceil() as u32
    } else {
        0
    };
    let radius_y = if sigma_y > 0.0 {
        (sigma_y * 3.0).ceil() as u32
    } else {
        0
    };
    let kernel_x = if radius_x > 0 {
        let mut k = vec![0.0_f32; (2 * radius_x + 1) as usize];
        compute_gaussian_kernel(&mut k, radius_x, sigma_x);
        Some(k)
    } else {
        None
    };
    let kernel_y = if radius_y > 0 {
        let mut k = vec![0.0_f32; (2 * radius_y + 1) as usize];
        compute_gaussian_kernel(&mut k, radius_y, sigma_y);
        Some(k)
    } else {
        None
    };

    extract_surface_pixels(out, source);

    let mut result_in_out = true;
    for _ in 0..pass_count {
        if let Some(ref kx) = kernel_x {
            if result_in_out {
                blur_surface_pixels_horizontal_weighted(scratch, out, width, height, kx);
            } else {
                blur_surface_pixels_horizontal_weighted(out, scratch, width, height, kx);
            }
            result_in_out = !result_in_out;
        }
        if let Some(ref ky) = kernel_y {
            if result_in_out {
                blur_surface_pixels_vertical_weighted(scratch, out, width, height, ky);
            } else {
                blur_surface_pixels_vertical_weighted(out, scratch, width, height, ky);
            }
            result_in_out = !result_in_out;
        }
    }

    if !result_in_out {
        out[..len].copy_from_slice(&scratch[..len]);
    }
}

/// Single horizontal box blur pass using a sliding-window accumulator — O(n)
/// per row regardless of radius. Reads from `source`, writes to `out`.
/// `out` must not alias `source`.
pub fn blur_surface_pixels_horizontal(
    out: &mut [u8],
    source: &[u8],
    width: u32,
    height: u32,
    radius: u32,
) {
    let radius = radius as i64;
    let width_i = width as i64;
    for y in 0..height {
        let row_offset = (y * width) as i64;
        let mut r = 0_i64;
        let mut g = 0_i64;
        let mut b = 0_i64;
        let mut a = 0_i64;
        let mut count = 0_i64;
        let init_end = (radius + 1).min(width_i);
        for x in 0..init_end {
            let i = ((row_offset + x) * 4) as usize;
            r += source[i] as i64;
            g += source[i + 1] as i64;
            b += source[i + 2] as i64;
            a += source[i + 3] as i64;
            count += 1;
        }
        for x in 0..width_i {
            let di = ((row_offset + x) * 4) as usize;
            out[di] = div_round(r, count);
            out[di + 1] = div_round(g, count);
            out[di + 2] = div_round(b, count);
            out[di + 3] = div_round(a, count);
            let leaving = x - radius;
            if leaving >= 0 {
                let li = ((row_offset + leaving) * 4) as usize;
                r -= source[li] as i64;
                g -= source[li + 1] as i64;
                b -= source[li + 2] as i64;
                a -= source[li + 3] as i64;
                count -= 1;
            }
            let entering = x + radius + 1;
            if entering < width_i {
                let ei = ((row_offset + entering) * 4) as usize;
                r += source[ei] as i64;
                g += source[ei + 1] as i64;
                b += source[ei + 2] as i64;
                a += source[ei + 3] as i64;
                count += 1;
            }
        }
    }
}

/// Single horizontal weighted blur pass. Kernel weights are applied at each
/// position; `kernel.len()` must be odd (2 * radius + 1). Reads from `source`,
/// writes to `out`. `out` must not alias `source`.
pub fn blur_surface_pixels_horizontal_weighted(
    out: &mut [u8],
    source: &[u8],
    width: u32,
    height: u32,
    kernel: &[f32],
) {
    let radius = ((kernel.len() - 1) >> 1) as i64;
    let width_i = width as i64;
    for y in 0..height as i64 {
        for x in 0..width_i {
            let mut r = 0.0_f32;
            let mut g = 0.0_f32;
            let mut b = 0.0_f32;
            let mut a = 0.0_f32;
            for (k, &w) in kernel.iter().enumerate() {
                let px = (x + k as i64 - radius).clamp(0, width_i - 1);
                let i = ((y * width_i + px) * 4) as usize;
                r += source[i] as f32 * w;
                g += source[i + 1] as f32 * w;
                b += source[i + 2] as f32 * w;
                a += source[i + 3] as f32 * w;
            }
            let di = ((y * width_i + x) * 4) as usize;
            out[di] = clamp_byte(r);
            out[di + 1] = clamp_byte(g);
            out[di + 2] = clamp_byte(b);
            out[di + 3] = clamp_byte(a);
        }
    }
}

/// Single vertical box blur pass using a sliding-window accumulator — O(n)
/// per column regardless of radius. Reads from `source`, writes to `out`.
/// `out` must not alias `source`.
pub fn blur_surface_pixels_vertical(
    out: &mut [u8],
    source: &[u8],
    width: u32,
    height: u32,
    radius: u32,
) {
    let radius = radius as i64;
    let width_i = width as i64;
    let height_i = height as i64;
    for x in 0..width_i {
        let mut r = 0_i64;
        let mut g = 0_i64;
        let mut b = 0_i64;
        let mut a = 0_i64;
        let mut count = 0_i64;
        let init_end = (radius + 1).min(height_i);
        for y in 0..init_end {
            let i = ((y * width_i + x) * 4) as usize;
            r += source[i] as i64;
            g += source[i + 1] as i64;
            b += source[i + 2] as i64;
            a += source[i + 3] as i64;
            count += 1;
        }
        for y in 0..height_i {
            let di = ((y * width_i + x) * 4) as usize;
            out[di] = div_round(r, count);
            out[di + 1] = div_round(g, count);
            out[di + 2] = div_round(b, count);
            out[di + 3] = div_round(a, count);
            let leaving = y - radius;
            if leaving >= 0 {
                let li = ((leaving * width_i + x) * 4) as usize;
                r -= source[li] as i64;
                g -= source[li + 1] as i64;
                b -= source[li + 2] as i64;
                a -= source[li + 3] as i64;
                count -= 1;
            }
            let entering = y + radius + 1;
            if entering < height_i {
                let ei = ((entering * width_i + x) * 4) as usize;
                r += source[ei] as i64;
                g += source[ei + 1] as i64;
                b += source[ei + 2] as i64;
                a += source[ei + 3] as i64;
                count += 1;
            }
        }
    }
}

/// Single vertical weighted blur pass. Kernel weights are applied at each
/// position; `kernel.len()` must be odd (2 * radius + 1). Reads from `source`,
/// writes to `out`. `out` must not alias `source`.
pub fn blur_surface_pixels_vertical_weighted(
    out: &mut [u8],
    source: &[u8],
    width: u32,
    height: u32,
    kernel: &[f32],
) {
    let radius = ((kernel.len() - 1) >> 1) as i64;
    let width_i = width as i64;
    let height_i = height as i64;
    for y in 0..height_i {
        for x in 0..width_i {
            let mut r = 0.0_f32;
            let mut g = 0.0_f32;
            let mut b = 0.0_f32;
            let mut a = 0.0_f32;
            for (k, &w) in kernel.iter().enumerate() {
                let py = (y + k as i64 - radius).clamp(0, height_i - 1);
                let i = ((py * width_i + x) * 4) as usize;
                r += source[i] as f32 * w;
                g += source[i + 1] as f32 * w;
                b += source[i + 2] as f32 * w;
                a += source[i + 3] as f32 * w;
            }
            let di = ((y * width_i + x) * 4) as usize;
            out[di] = clamp_byte(r);
            out[di + 1] = clamp_byte(g);
            out[di + 2] = clamp_byte(b);
            out[di + 3] = clamp_byte(a);
        }
    }
}

/// Fills `out` with a normalized 1-D Gaussian kernel of length `2 * radius + 1`.
/// `out` must be of exactly that length. Caller allocates once and reuses.
pub fn compute_gaussian_kernel(out: &mut [f32], radius: u32, sigma: f32) {
    let len = (2 * radius + 1) as usize;
    let radius = radius as usize;
    // sigma <= 0 has no spread: a unit impulse at the center (an identity blur).
    if sigma <= 0.0 {
        for v in out.iter_mut().take(len) {
            *v = 0.0;
        }
        out[radius] = 1.0;
        return;
    }
    let mut sum = 0.0_f32;
    let two_sigma_sq = 2.0 * sigma * sigma;
    for i in 0..len {
        let x = i as f32 - radius as f32;
        out[i] = (-(x * x) / two_sigma_sq).exp();
        sum += out[i];
    }
    for i in 0..len {
        out[i] /= sum;
    }
}

fn clamp_byte(value: f32) -> u8 {
    value.round().clamp(0.0, 255.0) as u8
}

// Rounds `numerator / denominator` to the nearest integer, clamped to a byte.
// `numerator` is a non-negative channel sum and `denominator` a positive count.
fn div_round(numerator: i64, denominator: i64) -> u8 {
    let q = (numerator as f64 / denominator as f64).round();
    q.clamp(0.0, 255.0) as u8
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

    #[test]
    fn blur_surface_pixels_horizontal_radius_zero_is_copy() {
        let source = vec![0, 0, 0, 255, 0, 0, 0, 0];
        let mut out = vec![0_u8; 8];
        blur_surface_pixels_horizontal(&mut out, &source, 2, 1, 0);
        assert_eq!(out[3], 255);
        assert_eq!(out[7], 0);
    }

    #[test]
    fn blur_surface_pixels_horizontal_edge_average() {
        let source = vec![0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0];
        let mut out = vec![0_u8; 12];
        blur_surface_pixels_horizontal(&mut out, &source, 3, 1, 1);
        assert_eq!(out[3], 128); // (0+255)/2
        assert_eq!(out[7], 85); // (0+255+0)/3
        assert_eq!(out[11], 128); // (255+0)/2
    }

    #[test]
    fn blur_surface_pixels_vertical_radius_zero_is_copy() {
        let source = vec![0, 0, 0, 255, 0, 0, 0, 0];
        let mut out = vec![0_u8; 8];
        blur_surface_pixels_vertical(&mut out, &source, 1, 2, 0);
        assert_eq!(out[3], 255);
        assert_eq!(out[7], 0);
    }

    #[test]
    fn blur_surface_pixels_vertical_spreads_alpha() {
        let source = vec![0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0];
        let mut out = vec![0_u8; 12];
        blur_surface_pixels_vertical(&mut out, &source, 1, 3, 1);
        assert!(out[3] > 0);
        assert!(out[11] > 0);
    }

    #[test]
    fn blur_surface_pixels_horizontal_weighted_identity_kernel() {
        let kernel = [1.0_f32];
        let source = vec![0x11, 0x22, 0x33, 0xff];
        let mut out = vec![0_u8; 4];
        blur_surface_pixels_horizontal_weighted(&mut out, &source, 1, 1, &kernel);
        assert_eq!(out[0], 0x11);
        assert_eq!(out[3], 0xff);
    }

    #[test]
    fn blur_surface_pixels_weighted_center_heaviest() {
        let mut kernel = [0.0_f32; 3];
        compute_gaussian_kernel(&mut kernel, 1, 0.8);
        let source = vec![0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0];
        let mut out = vec![0_u8; 12];
        blur_surface_pixels_horizontal_weighted(&mut out, &source, 3, 1, &kernel);
        assert!(out[7] > out[3]);
        assert!(out[7] > out[11]);

        let mut outv = vec![0_u8; 12];
        blur_surface_pixels_vertical_weighted(&mut outv, &source, 1, 3, &kernel);
        assert!(outv[7] > outv[3]);
    }

    #[test]
    fn blur_surface_pixels_vertical_weighted_applies_gaussian_weights() {
        let mut kernel = [0.0_f32; 3];
        compute_gaussian_kernel(&mut kernel, 1, 0.8);
        let source = vec![0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0];
        let mut out = vec![0_u8; 12];
        blur_surface_pixels_vertical_weighted(&mut out, &source, 1, 3, &kernel);
        assert!(out[7] > out[3]);
    }

    #[test]
    fn compute_gaussian_kernel_sums_to_one() {
        let mut kernel = [0.0_f32; 7];
        compute_gaussian_kernel(&mut kernel, 3, 1.0);
        let sum: f32 = kernel.iter().sum();
        assert!((sum - 1.0).abs() < 1e-5);
    }

    #[test]
    fn compute_gaussian_kernel_is_symmetric_and_centered() {
        let mut kernel = [0.0_f32; 5];
        compute_gaussian_kernel(&mut kernel, 2, 1.0);
        assert!((kernel[0] - kernel[4]).abs() < 1e-6);
        assert!((kernel[1] - kernel[3]).abs() < 1e-6);
        assert!(kernel[2] > kernel[1]);
        assert!(kernel[1] > kernel[0]);
    }

    #[test]
    fn compute_gaussian_kernel_sigma_zero_is_impulse() {
        let mut kernel = [9.0_f32; 5];
        compute_gaussian_kernel(&mut kernel, 2, 0.0);
        assert_eq!(kernel[2], 1.0);
        assert_eq!(kernel[0], 0.0);
        assert_eq!(kernel[4], 0.0);
        assert!(kernel.iter().all(|v| !v.is_nan()));
    }

    #[test]
    fn apply_surface_box_blur_filter_spreads_alpha() {
        let mut source = create_surface(3, 1, 0);
        source.data[7] = 255; // center pixel opaque
        let mut out = vec![0_u8; 12];
        let mut scratch = vec![0_u8; 12];
        apply_surface_box_blur_filter(
            &mut out,
            &mut scratch,
            &region(source),
            &SurfaceBoxBlurFilterOptions {
                radius_x: 2,
                radius_y: 0,
                passes: 1,
            },
        );
        assert!(out[3] > 0);
        assert!(out[11] > 0);
    }

    #[test]
    fn apply_surface_box_blur_filter_zero_radius_is_copy() {
        let source = create_surface(1, 1, 0x336699ff);
        let mut out = vec![0_u8; 4];
        let mut scratch = vec![0_u8; 4];
        apply_surface_box_blur_filter(
            &mut out,
            &mut scratch,
            &region(source),
            &SurfaceBoxBlurFilterOptions {
                radius_x: 0,
                radius_y: 0,
                passes: 1,
            },
        );
        assert_eq!(out[0], 0x33);
        assert_eq!(out[3], 0xff);
    }

    #[test]
    fn apply_surface_box_blur_filter_offset_region() {
        // 4 px alpha: [_, 255, 100, _]. Blurring region (1,0,2,1) extracts
        // [255, 100] and averages them.
        let mut source = create_surface(4, 1, 0);
        source.data[1 * 4 + 3] = 255;
        source.data[2 * 4 + 3] = 100;
        let region = SurfaceRegion {
            surface: source,
            x: 1,
            y: 0,
            width: 2,
            height: 1,
        };
        let mut out = vec![0_u8; 8];
        let mut scratch = vec![0_u8; 8];
        apply_surface_box_blur_filter(
            &mut out,
            &mut scratch,
            &region,
            &SurfaceBoxBlurFilterOptions {
                radius_x: 2,
                radius_y: 0,
                passes: 1,
            },
        );
        assert_eq!(out[3], 178); // round((255 + 100) / 2)
        assert_eq!(out[7], 178);
    }

    #[test]
    fn apply_surface_box_blur_filter_passes() {
        // Result must land in `out` regardless of pass parity.
        let source = create_surface(3, 3, 0xffffff88);
        let mut out = vec![0_u8; 36];
        let mut scratch = vec![0_u8; 36];
        apply_surface_box_blur_filter(
            &mut out,
            &mut scratch,
            &region(source),
            &SurfaceBoxBlurFilterOptions {
                radius_x: 2,
                radius_y: 0,
                passes: 1,
            },
        );
        assert!(out[3] > 0);
    }

    #[test]
    fn apply_surface_gaussian_blur_filter_spreads_alpha() {
        let mut source = create_surface(5, 1, 0);
        source.data[2 * 4 + 3] = 255;
        let mut out = vec![0_u8; 20];
        let mut scratch = vec![0_u8; 20];
        apply_surface_gaussian_blur_filter(&mut out, &mut scratch, &region(source), 1.0, 1.0, 1);
        assert!(out[3] > 0);
        assert!(out[4 * 4 + 3] > 0);
    }

    #[test]
    fn apply_surface_gaussian_blur_filter_center_heaviest() {
        let mut source = create_surface(5, 1, 0);
        source.data[2 * 4 + 3] = 255;
        let mut out = vec![0_u8; 20];
        let mut scratch = vec![0_u8; 20];
        apply_surface_gaussian_blur_filter(&mut out, &mut scratch, &region(source), 0.8, 0.8, 1);
        assert!(out[2 * 4 + 3] > out[3]);
    }

    #[test]
    fn apply_surface_gaussian_blur_filter_sigma_zero_identity() {
        let source = create_surface(1, 1, 0x336699ff);
        let mut out = vec![0_u8; 4];
        let mut scratch = vec![0_u8; 4];
        apply_surface_gaussian_blur_filter(&mut out, &mut scratch, &region(source), 0.0, 0.0, 1);
        assert_eq!(out[0], 0x33);
        assert_eq!(out[3], 0xff);
    }
}
