use flight_entity::Uint8Array;
use crate::types::*;

const LUMA_R: f32 = 0.213;
const LUMA_G: f32 = 0.715;
const LUMA_B: f32 = 0.072;

fn clamp_byte(value: f32) -> u8 {
    value.round().max(0.0).min(255.0) as u8
}

fn set_color_matrix(out: &mut [f32; 20], values: [f32; 20]) {
    *out = values;
}

pub fn build_bitmap_brightness_color_matrix(out: &mut [f32; 20], amount: f32) {
    set_color_matrix(out, [amount, 0.0, 0.0, 0.0, 0.0, 0.0, amount, 0.0, 0.0, 0.0, 0.0, 0.0, amount, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0]);
}

pub fn build_bitmap_contrast_color_matrix(out: &mut [f32; 20], amount: f32) {
    let t = 127.5 * (1.0 - amount);
    set_color_matrix(out, [amount, 0.0, 0.0, 0.0, t, 0.0, amount, 0.0, 0.0, t, 0.0, 0.0, amount, 0.0, t, 0.0, 0.0, 0.0, 1.0, 0.0]);
}

pub fn build_bitmap_grayscale_color_matrix(out: &mut [f32; 20]) {
    build_bitmap_saturation_color_matrix(out, 0.0);
}

pub fn build_bitmap_hue_rotation_color_matrix(out: &mut [f32; 20], degrees: f32) {
    let radians = degrees * std::f32::consts::PI / 180.0;
    let c = radians.cos();
    let s = radians.sin();
    set_color_matrix(out, [
        0.213 + c * 0.787 - s * 0.213,
        0.715 - c * 0.715 - s * 0.715,
        0.072 - c * 0.072 + s * 0.928,
        0.0, 0.0,
        0.213 - c * 0.213 + s * 0.143,
        0.715 + c * 0.285 + s * 0.14,
        0.072 - c * 0.072 - s * 0.283,
        0.0, 0.0,
        0.213 - c * 0.213 - s * 0.787,
        0.715 - c * 0.715 + s * 0.715,
        0.072 + c * 0.928 + s * 0.072,
        0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ]);
}

pub fn build_bitmap_invert_color_matrix(out: &mut [f32; 20]) {
    set_color_matrix(out, [-1.0, 0.0, 0.0, 0.0, 255.0, 0.0, -1.0, 0.0, 0.0, 255.0, 0.0, 0.0, -1.0, 0.0, 255.0, 0.0, 0.0, 0.0, 1.0, 0.0]);
}

pub fn build_bitmap_saturation_color_matrix(out: &mut [f32; 20], amount: f32) {
    let inv = 1.0 - amount;
    let r = LUMA_R * inv;
    let g = LUMA_G * inv;
    let b = LUMA_B * inv;
    set_color_matrix(out, [r + amount, g, b, 0.0, 0.0, r, g + amount, b, 0.0, 0.0, r, g, b + amount, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0]);
}

pub fn build_bitmap_sepia_color_matrix(out: &mut [f32; 20]) {
    set_color_matrix(out, [0.393, 0.769, 0.189, 0.0, 0.0, 0.349, 0.686, 0.168, 0.0, 0.0, 0.272, 0.534, 0.131, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0]);
}

/// Applies a 4x5 color matrix to source and writes into out.
pub fn color_matrix_bitmap(
    out: &mut Uint8Array,
    source: &BitmapRegion,
    matrix: &[f32],
) {
    assert!(matrix.len() >= 20, "Color matrix filter requires 20 values");
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
            let r = source.bitmap.data[si] as f32;
            let g = source.bitmap.data[si + 1] as f32;
            let b = source.bitmap.data[si + 2] as f32;
            let a = source.bitmap.data[si + 3] as f32;
            out[di] = clamp_byte(r * matrix[0] + g * matrix[1] + b * matrix[2] + a * matrix[3] + matrix[4]);
            out[di + 1] = clamp_byte(r * matrix[5] + g * matrix[6] + b * matrix[7] + a * matrix[8] + matrix[9]);
            out[di + 2] = clamp_byte(r * matrix[10] + g * matrix[11] + b * matrix[12] + a * matrix[13] + matrix[14]);
            out[di + 3] = clamp_byte(r * matrix[15] + g * matrix[16] + b * matrix[17] + a * matrix[18] + matrix[19]);
        }
    }
}

/// Composes two 4x5 color matrices: result applies first, then second.
pub fn concat_bitmap_color_matrix(out: &mut [f32; 20], first: &[f32; 20], second: &[f32; 20]) {
    for row in 0..4 {
        for col in 0..5 {
            let mut sum = if col == 4 { second[row * 5 + 4] } else { 0.0 };
            for k in 0..4 {
                let f_val = if col == 4 { first[k * 5 + 4] } else { first[k * 5 + col] };
                sum += second[row * 5 + k] * f_val;
            }
            out[row * 5 + col] = sum;
        }
    }
}

/// Writes the identity color matrix into out.
pub fn set_bitmap_color_matrix_identity(out: &mut [f32; 20]) {
    set_color_matrix(out, [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0]);
}
