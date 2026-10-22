const MAX_BLUR_SIGMA_PER_LEVEL: f32 = 4.0;

pub fn get_blur_downsample_level(sigma: f32) -> u32 {
    if sigma <= MAX_BLUR_SIGMA_PER_LEVEL {
        return 0;
    }
    return (sigma / MAX_BLUR_SIGMA_PER_LEVEL).log2().ceil() as u32;
}

pub fn get_blur_residual_sigma(sigma: f32, level: u32) -> f32 {
    if sigma <= 0.0 {
        return 0.0;
    }
    return sigma / 2.0_f32.powi(level as i32);
}
