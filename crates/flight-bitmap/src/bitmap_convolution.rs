use flight_entity::Uint8Array;
use crate::types::*;

/// Applies a convolution kernel to source, writing into out.
pub fn convolve_bitmap(
    out: &mut Uint8Array,
    source: &BitmapRegion,
    options: &BitmapConvolutionOptions,
) {
    let matrix = &options.matrix;
    let mx = options.matrix_x;
    let my = options.matrix_y;
    assert!(mx > 0 && my > 0, "Convolution filter matrix dimensions must be positive");
    assert!(matrix.len() >= (mx * my) as usize, "Convolution filter matrix does not match its dimensions");

    let raw_divisor = options.divisor.unwrap_or_else(|| get_convolution_divisor(matrix, (mx * my) as usize));
    let divisor = if raw_divisor == 0.0 { 1.0 } else { raw_divisor };
    let bias = options.bias.unwrap_or(0.0);
    let edge = options.edge.unwrap_or(BitmapEdgeMode::Clamp);
    let preserve_alpha = options.preserve_alpha.unwrap_or(true);
    let offset_x = mx / 2;
    let offset_y = my / 2;
    let bw = source.bitmap.width as i32;
    let bh = source.bitmap.height as i32;
    let data = &source.bitmap.data;

    for py in 0..source.height {
        for px in 0..source.width {
            let mut r = 0.0f32;
            let mut g = 0.0f32;
            let mut b = 0.0f32;
            let mut a = 0.0f32;
            for ky in 0..my {
                let raw_sy = source.y + py + ky - offset_y;
                let wrs = (ky * mx) as usize;
                for kx in 0..mx {
                    let raw_sx = source.x + px + kx - offset_x;
                    let weight = matrix[wrs + kx as usize];
                    let (sample_x, sample_y);
                    if raw_sy < 0 || raw_sy >= bh || raw_sx < 0 || raw_sx >= bw {
                        match edge {
                            BitmapEdgeMode::Transparent => continue,
                            BitmapEdgeMode::Wrap => {
                                sample_x = ((raw_sx % bw) + bw) % bw;
                                sample_y = ((raw_sy % bh) + bh) % bh;
                            }
                            BitmapEdgeMode::Mirror => {
                                sample_x = resolve_convolution_mirror(raw_sx, bw);
                                sample_y = resolve_convolution_mirror(raw_sy, bh);
                            }
                            _ => {
                                sample_x = raw_sx.max(0).min(bw - 1);
                                sample_y = raw_sy.max(0).min(bh - 1);
                            }
                        }
                    } else {
                        sample_x = raw_sx;
                        sample_y = raw_sy;
                    }
                    let i = (sample_y as usize * bw as usize + sample_x as usize) * 4;
                    r += data[i] as f32 * weight;
                    g += data[i + 1] as f32 * weight;
                    b += data[i + 2] as f32 * weight;
                    a += data[i + 3] as f32 * weight;
                }
            }
            let di = (py as usize * source.width as usize + px as usize) * 4;
            out[di] = clamp_byte(r / divisor + bias);
            out[di + 1] = clamp_byte(g / divisor + bias);
            out[di + 2] = clamp_byte(b / divisor + bias);
            if preserve_alpha {
                let cy = (source.y + py).max(0).min(bh - 1);
                let cx = (source.x + px).max(0).min(bw - 1);
                out[di + 3] = data[(cy as usize * bw as usize + cx as usize) * 4 + 3];
            } else {
                out[di + 3] = clamp_byte(a / divisor + bias);
            }
        }
    }
}

fn clamp_byte(value: f32) -> u8 {
    value.round().max(0.0).min(255.0) as u8
}

fn get_convolution_divisor(matrix: &[f32], length: usize) -> f32 {
    let sum: f32 = matrix[..length].iter().sum();
    if sum == 0.0 { 1.0 } else { sum }
}

fn resolve_convolution_mirror(v: i32, size: i32) -> i32 {
    let period = 2 * size;
    let wrapped = ((v % period) + period) % period;
    if wrapped < size { wrapped } else { period - 1 - wrapped }
}
