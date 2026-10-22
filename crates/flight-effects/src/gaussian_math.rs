// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn create_gaussian_kernel_weights(out: &mut [f32], radius: f32, sigma: f32) -> usize {
    let r = radius.ceil().max(0.0) as usize;
    let s = sigma.max(1e-6);
    let two_sigma_sq = 2.0 * s * s;
    let mut sum = 0.0;
    for (i, value) in out.iter_mut().enumerate().take(r + 1) {
        let x = i as f32;
        *value = (-(x * x) / two_sigma_sq).exp();
        sum += if i == 0 { *value } else { 2.0 * *value };
    }
    let inverse_sum = 1.0 / sum;
    for value in out.iter_mut().take(r + 1) {
        *value *= inverse_sum;
    }
    return r + 1;
}

pub fn compute_gaussian_radius_from_sigma(sigma: f32) -> f32 {
    return (3.0 * sigma.max(0.0)).ceil();
}

pub fn compute_gaussian_sigma_from_radius(radius: f32) -> f32 {
    return radius.max(0.0) / 3.0;
}

pub fn compute_separable_blur_pass_count(samples: Option<f32>) -> f32 {
    return (samples.unwrap_or(1.0) + 0.5).floor().max(1.0);
}
