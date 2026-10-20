use crate::bitmap_composite::extract_bitmap_pixels;
use crate::types::*;

/// Single horizontal box blur pass using a sliding-window accumulator.
pub fn blur_bitmap_pixels_horizontal(
    out: &mut [u8],
    source: &[u8],
    width: i32,
    height: i32,
    radius: i32,
) {
    let w = width as usize;
    for y in 0..height as usize {
        let row_offset = y * w;
        let mut r: i32 = 0;
        let mut g: i32 = 0;
        let mut b: i32 = 0;
        let mut a: i32 = 0;
        let mut count: i32 = 0;
        let init_end = ((radius + 1) as usize).min(w);
        for x in 0..init_end {
            let i = (row_offset + x) * 4;
            r += source[i] as i32;
            g += source[i + 1] as i32;
            b += source[i + 2] as i32;
            a += source[i + 3] as i32;
            count += 1;
        }
        for x in 0..w {
            let di = (row_offset + x) * 4;
            out[di] = ((r as f64 / count as f64).round()) as u8;
            out[di + 1] = ((g as f64 / count as f64).round()) as u8;
            out[di + 2] = ((b as f64 / count as f64).round()) as u8;
            out[di + 3] = ((a as f64 / count as f64).round()) as u8;
            let leaving = x as i32 - radius;
            if leaving >= 0 {
                let li = (row_offset + leaving as usize) * 4;
                r -= source[li] as i32;
                g -= source[li + 1] as i32;
                b -= source[li + 2] as i32;
                a -= source[li + 3] as i32;
                count -= 1;
            }
            let entering = x as i32 + radius + 1;
            if (entering as usize) < w {
                let ei = (row_offset + entering as usize) * 4;
                r += source[ei] as i32;
                g += source[ei + 1] as i32;
                b += source[ei + 2] as i32;
                a += source[ei + 3] as i32;
                count += 1;
            }
        }
    }
}

/// Single horizontal weighted blur pass.
pub fn blur_bitmap_pixels_horizontal_weighted(
    out: &mut [u8],
    source: &[u8],
    width: i32,
    height: i32,
    kernel: &[f32],
) {
    let w = width as usize;
    let h = height as usize;
    let radius = (kernel.len() - 1) / 2;
    for y in 0..h {
        for x in 0..w {
            let mut r = 0.0f32;
            let mut g = 0.0f32;
            let mut b = 0.0f32;
            let mut a = 0.0f32;
            for k in 0..kernel.len() {
                let px = (x as i32 + k as i32 - radius as i32).max(0).min(w as i32 - 1) as usize;
                let i = (y * w + px) * 4;
                let wt = kernel[k];
                r += source[i] as f32 * wt;
                g += source[i + 1] as f32 * wt;
                b += source[i + 2] as f32 * wt;
                a += source[i + 3] as f32 * wt;
            }
            let di = (y * w + x) * 4;
            out[di] = r.round() as u8;
            out[di + 1] = g.round() as u8;
            out[di + 2] = b.round() as u8;
            out[di + 3] = a.round() as u8;
        }
    }
}

/// Single vertical box blur pass using a sliding-window accumulator.
pub fn blur_bitmap_pixels_vertical(
    out: &mut [u8],
    source: &[u8],
    width: i32,
    height: i32,
    radius: i32,
) {
    let w = width as usize;
    let h = height as usize;
    for x in 0..w {
        let mut r: i32 = 0;
        let mut g: i32 = 0;
        let mut b: i32 = 0;
        let mut a: i32 = 0;
        let mut count: i32 = 0;
        let init_end = ((radius + 1) as usize).min(h);
        for y in 0..init_end {
            let i = (y * w + x) * 4;
            r += source[i] as i32;
            g += source[i + 1] as i32;
            b += source[i + 2] as i32;
            a += source[i + 3] as i32;
            count += 1;
        }
        for y in 0..h {
            let di = (y * w + x) * 4;
            out[di] = ((r as f64 / count as f64).round()) as u8;
            out[di + 1] = ((g as f64 / count as f64).round()) as u8;
            out[di + 2] = ((b as f64 / count as f64).round()) as u8;
            out[di + 3] = ((a as f64 / count as f64).round()) as u8;
            let leaving = y as i32 - radius;
            if leaving >= 0 {
                let li = (leaving as usize * w + x) * 4;
                r -= source[li] as i32;
                g -= source[li + 1] as i32;
                b -= source[li + 2] as i32;
                a -= source[li + 3] as i32;
                count -= 1;
            }
            let entering = y as i32 + radius + 1;
            if (entering as usize) < h {
                let ei = (entering as usize * w + x) * 4;
                r += source[ei] as i32;
                g += source[ei + 1] as i32;
                b += source[ei + 2] as i32;
                a += source[ei + 3] as i32;
                count += 1;
            }
        }
    }
}

/// Single vertical weighted blur pass.
pub fn blur_bitmap_pixels_vertical_weighted(
    out: &mut [u8],
    source: &[u8],
    width: i32,
    height: i32,
    kernel: &[f32],
) {
    let w = width as usize;
    let h = height as usize;
    let radius = (kernel.len() - 1) / 2;
    for y in 0..h {
        for x in 0..w {
            let mut r = 0.0f32;
            let mut g = 0.0f32;
            let mut b = 0.0f32;
            let mut a = 0.0f32;
            for k in 0..kernel.len() {
                let py = (y as i32 + k as i32 - radius as i32).max(0).min(h as i32 - 1) as usize;
                let i = (py * w + x) * 4;
                let wt = kernel[k];
                r += source[i] as f32 * wt;
                g += source[i + 1] as f32 * wt;
                b += source[i + 2] as f32 * wt;
                a += source[i + 3] as f32 * wt;
            }
            let di = (y * w + x) * 4;
            out[di] = r.round() as u8;
            out[di + 1] = g.round() as u8;
            out[di + 2] = b.round() as u8;
            out[di + 3] = a.round() as u8;
        }
    }
}

/// Multi-pass box blur on a region.
pub fn box_blur_bitmap(
    out: &mut Vec<u8>,
    scratch: &mut Vec<u8>,
    source: &BitmapRegion,
    options: &BitmapBoxBlurOptions,
) {
    let radius_x = (options.radius_x.unwrap_or(2).max(0)) as i32;
    let radius_y = (options.radius_y.unwrap_or(2).max(0)) as i32;
    let passes = (options.passes.unwrap_or(1).max(1)) as usize;

    extract_bitmap_pixels(out, source);

    let w = source.width;
    let h = source.height;
    let mut swapped = false;
    for _ in 0..passes {
        if radius_x > 0 {
            if swapped {
                blur_bitmap_pixels_horizontal(out, scratch, w, h, radius_x);
            } else {
                blur_bitmap_pixels_horizontal(scratch, out, w, h, radius_x);
            }
            swapped = !swapped;
        }
        if radius_y > 0 {
            if swapped {
                blur_bitmap_pixels_vertical(out, scratch, w, h, radius_y);
            } else {
                blur_bitmap_pixels_vertical(scratch, out, w, h, radius_y);
            }
            swapped = !swapped;
        }
    }

    if swapped {
        let len = (w as usize) * (h as usize) * 4;
        out[..len].copy_from_slice(&scratch[..len]);
    }
}

/// Fills out with a normalized 1-D Gaussian kernel of length 2*radius+1.
pub fn compute_gaussian_kernel(out: &mut [f32], radius: usize, sigma: f32) {
    let len = 2 * radius + 1;
    if sigma <= 0.0 {
        for i in 0..len {
            out[i] = 0.0;
        }
        out[radius] = 1.0;
        return;
    }
    let mut sum = 0.0f32;
    let two_sigma_sq = 2.0 * sigma * sigma;
    for i in 0..len {
        let x = i as f32 - radius as f32;
        out[i] = (-x * x / two_sigma_sq).exp();
        sum += out[i];
    }
    for i in 0..len {
        out[i] /= sum;
    }
}

/// Multi-pass Gaussian blur on a region.
pub fn gaussian_blur_bitmap(
    out: &mut Vec<u8>,
    scratch: &mut Vec<u8>,
    source: &BitmapRegion,
    sigma_x: f32,
    sigma_y: f32,
    passes: i32,
) {
    let pass_count = passes.max(1) as usize;

    let radius_x = (sigma_x * 3.0).ceil().max(0.0) as usize;
    let radius_y = (sigma_y * 3.0).ceil().max(0.0) as usize;
    let kernel_x = if radius_x > 0 {
        let mut k = vec![0.0f32; 2 * radius_x + 1];
        compute_gaussian_kernel(&mut k, radius_x, sigma_x);
        Some(k)
    } else {
        None
    };
    let kernel_y = if radius_y > 0 {
        let mut k = vec![0.0f32; 2 * radius_y + 1];
        compute_gaussian_kernel(&mut k, radius_y, sigma_y);
        Some(k)
    } else {
        None
    };

    extract_bitmap_pixels(out, source);

    let w = source.width;
    let h = source.height;
    let mut swapped = false;

    for _ in 0..pass_count {
        if let Some(ref kx) = kernel_x {
            if swapped {
                blur_bitmap_pixels_horizontal_weighted(out, scratch, w, h, kx);
            } else {
                blur_bitmap_pixels_horizontal_weighted(scratch, out, w, h, kx);
            }
            swapped = !swapped;
        }
        if let Some(ref ky) = kernel_y {
            if swapped {
                blur_bitmap_pixels_vertical_weighted(out, scratch, w, h, ky);
            } else {
                blur_bitmap_pixels_vertical_weighted(scratch, out, w, h, ky);
            }
            swapped = !swapped;
        }
    }

    if swapped {
        let len = (w as usize) * (h as usize) * 4;
        out[..len].copy_from_slice(&scratch[..len]);
    }
}
