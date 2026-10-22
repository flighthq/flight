use crate::contract::get_gaussian_kernel_size;

// flight-lint: allow(conform-params) D24 requires caller-owned outputs first
pub fn compute_linear_sampled_gaussian(
    out_weights: &mut Vec<f32>,
    out_offsets: &mut Vec<f32>,
    sigma: f32,
) {
    let size = get_gaussian_kernel_size(sigma);
    let tap_count = get_linear_sampled_gaussian_tap_count(sigma);
    let radius = (size - 1) as f32 / 2.0;
    out_weights.clear();
    out_offsets.clear();
    out_weights.resize(tap_count, 0.0);
    out_offsets.resize(tap_count, 0.0);
    if size == 1 {
        out_weights[0] = 1.0;
        return;
    }
    let two_sigma_squared = 2.0 * sigma * sigma;
    let mut sum = 0.0;
    for i in 0..size {
        let x = i as f32 - radius;
        sum += (-(x * x) / two_sigma_squared).exp();
    }
    for tap in 0..tap_count {
        let i = tap * 2;
        let pos_a = i as f32 - radius;
        let weight_a = (-(pos_a * pos_a) / two_sigma_squared).exp() / sum;
        if i + 1 < size {
            let pos_b = pos_a + 1.0;
            let weight_b = (-(pos_b * pos_b) / two_sigma_squared).exp() / sum;
            let combined = weight_a + weight_b;
            out_weights[tap] = combined;
            out_offsets[tap] = if combined == 0.0 {
                pos_a + 0.5
            } else {
                (pos_a * weight_a + pos_b * weight_b) / combined
            };
        } else {
            out_weights[tap] = weight_a;
            out_offsets[tap] = pos_a;
        }
    }
}

pub fn get_linear_sampled_gaussian_tap_count(sigma: f32) -> usize {
    return get_gaussian_kernel_size(sigma).div_ceil(2);
}
