// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn compute_gaussian_kernel_weights(out: &mut Vec<f32>, sigma: f32) {
    let size = get_gaussian_kernel_size(sigma);
    out.clear();
    out.resize(size, 0.0);
    if size == 1 {
        out[0] = 1.0;
        return;
    }
    let radius = (size - 1) as f32 / 2.0;
    let two_sigma_squared = 2.0 * sigma * sigma;
    let mut sum = 0.0;
    for (i, weight) in out.iter_mut().enumerate() {
        let x = i as f32 - radius;
        *weight = (-(x * x) / two_sigma_squared).exp();
        sum += *weight;
    }
    let inverse_sum = 1.0 / sum;
    for weight in out {
        *weight *= inverse_sum;
    }
}

pub fn get_gaussian_kernel_size(sigma: f32) -> usize {
    if sigma <= 0.0 {
        return 1;
    }
    let radius = (3.0 * sigma).ceil() as usize;
    return radius * 2 + 1;
}
