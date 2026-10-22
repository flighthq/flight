// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn create_bayer_matrix(out: &mut [f32], order: f32) -> usize {
    let exponent = (order + 0.5).floor().max(1.0) as u32;
    let size = 2_usize.pow(exponent);
    let denominator = (size * size) as f32;
    for y in 0..size {
        for x in 0..size {
            let mut value = 0_u32;
            for bit in 0..exponent {
                let x_bit = ((x >> bit) & 1) as u32;
                let y_bit = ((y >> bit) & 1) as u32;
                let digit = match (y_bit, x_bit) {
                    (0, 0) => 0,
                    (0, 1) => 2,
                    (1, 0) => 3,
                    _ => 1,
                };
                value += digit * 4_u32.pow(exponent - 1 - bit);
            }
            out[y * size + x] = value as f32 / denominator;
        }
    }
    return size;
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn compute_crt_mask_params(out: &mut [f32; 2], resolution: f32, curvature: f32) {
    out[0] = resolution.max(1.0) / 360.0;
    out[1] = curvature.clamp(0.0, 1.0) * 0.1;
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn compute_halftone_cell_params(out: &mut [f32; 3], frequency: f32, angle: f32) {
    out[0] = if frequency > 1e-10 {
        1.0 / frequency
    } else {
        1.0
    };
    out[1] = angle.cos();
    out[2] = angle.sin();
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn compute_scanline_params(out: &mut [f32; 2], resolution: f32, intensity: f32) {
    out[0] = resolution.max(1.0) / 480.0;
    out[1] = intensity.clamp(0.0, 1.0);
}
