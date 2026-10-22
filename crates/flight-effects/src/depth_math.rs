pub fn compute_depth_of_field_coc(
    depth: f32,
    focus_distance: f32,
    aperture: f32,
    focal_length: f32,
) -> f32 {
    let fd = focus_distance.max(1e-5);
    let fl = focal_length.max(1e-5) / 1000.0;
    let d = depth.max(1e-5);
    let a = fl / aperture.max(1e-5);
    return (a * (d - fd)) / (d * (fd - fl));
}

pub fn compute_linear_depth_from_nonlinear(depth: f32, near: f32, far: f32) -> f32 {
    return (near * far) / (far - depth * (far - near));
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn compute_ssao_sample_kernel(out: &mut [f32], samples: f32) -> usize {
    let n = (samples + 0.5).floor().max(1.0) as usize;
    for i in 0..n {
        let h2 = halton(i + 1, 2);
        let h3 = halton(i + 1, 3);
        let theta = h2 * 2.0 * std::f32::consts::PI;
        let phi = (1.0 - h3).acos();
        let scale = i as f32 / n as f32;
        let dist = 0.1 + 0.9 * scale * scale;
        out[i * 3] = phi.sin() * theta.cos() * dist;
        out[i * 3 + 1] = phi.sin() * theta.sin() * dist;
        out[i * 3 + 2] = phi.cos() * dist;
    }
    return n;
}

fn halton(index: usize, base: usize) -> f32 {
    let mut result = 0.0;
    let mut factor = 1.0;
    let mut value = index;
    while value > 0 {
        factor /= base as f32;
        result += factor * (value % base) as f32;
        value /= base;
    }
    return result;
}
