use crate::contract::{OutlineEffect, SketchEffect};

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn compute_outline_edge_params(out: &mut [f32; 6], effect: &OutlineEffect) {
    let threshold = effect.threshold.unwrap_or(0.1).max(0.0);
    let color = effect.color.unwrap_or(0x000000ff);
    out[0] = threshold;
    out[1] = threshold * 0.5;
    out[2] = ((color >> 24) & 0xff) as f32 / 255.0;
    out[3] = ((color >> 16) & 0xff) as f32 / 255.0;
    out[4] = ((color >> 8) & 0xff) as f32 / 255.0;
    out[5] = (color & 0xff) as f32 / 255.0;
}

pub fn compute_outline_thickness_px(effect: &OutlineEffect) -> f32 {
    return (effect.thickness.unwrap_or(1.0) + 0.5).floor().max(0.0);
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn compute_sketch_edge_params(out: &mut [f32; 2], effect: &SketchEffect) {
    let strength = effect.strength.unwrap_or(1.0).clamp(0.0, 1.0);
    out[0] = (1.0 - strength * 0.95).clamp(0.01, 1.0);
    out[1] = strength;
}

pub fn get_sobel_kernel_coefficients(out: &mut [f32]) {
    out[..18].copy_from_slice(&[
        -1.0, 0.0, 1.0, -2.0, 0.0, 2.0, -1.0, 0.0, 1.0, -1.0, -2.0, -1.0, 0.0, 0.0, 0.0, 1.0, 2.0,
        1.0,
    ]);
}
