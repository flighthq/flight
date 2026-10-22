use crate::contract::KuwaharaEffect;

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn compute_kuwahara_gaussian_weights(out: &mut [f32], radius: f32) -> usize {
    let r = radius.floor().max(1.0) as usize;
    let size = r + 1;
    let sigma = r as f32 / 2.0;
    let two_sigma_sq = 2.0 * sigma * sigma;
    let mut sum = 0.0;
    for y in 0..size {
        for x in 0..size {
            let d = (x * x + y * y) as f32;
            let value = (-d / two_sigma_sq).exp();
            out[y * size + x] = value;
            sum += value;
        }
    }
    let inverse_sum = if sum > 1e-10 { 1.0 / sum } else { 1.0 };
    for value in out.iter_mut().take(size * size) {
        *value *= inverse_sum;
    }
    return size * size;
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn compute_kuwahara_sector_offsets(out: &mut [f32; 8], radius: f32) {
    let half = radius.floor().max(1.0);
    *out = [-half, -half, 0.0, -half, -half, 0.0, 0.0, 0.0];
}

pub fn compute_kuwahara_sector_pixel_count(effect: &KuwaharaEffect) -> usize {
    let size = compute_kuwahara_sector_size(effect);
    return size * size;
}

pub fn compute_kuwahara_sector_size(effect: &KuwaharaEffect) -> usize {
    return effect.radius.unwrap_or(3.0).floor().max(1.0) as usize + 1;
}
