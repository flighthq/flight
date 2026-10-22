use crate::contract::GodRaysEffect;

pub fn compute_god_rays_accumulation_scale(effect: &GodRaysEffect) -> f32 {
    let samples = effect.samples.unwrap_or(100.0).max(1.0);
    let weight = effect.weight.unwrap_or(0.4).max(1e-6);
    let exposure = effect.exposure.unwrap_or(0.1).max(1e-6);
    return 1.0 / (samples * weight * exposure);
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn compute_god_rays_light_center(out: &mut [f32; 2], effect: &GodRaysEffect) {
    out[0] = effect.center_x.unwrap_or(0.5).clamp(0.0, 1.0);
    out[1] = effect.center_y.unwrap_or(0.5).clamp(0.0, 1.0);
}

pub fn compute_god_rays_sample_weight(effect: &GodRaysEffect, sample_index: f32) -> f32 {
    let decay = effect.decay.unwrap_or(0.96);
    let weight = effect.weight.unwrap_or(0.4);
    let exposure = effect.exposure.unwrap_or(0.1);
    return decay.powf(sample_index) * weight * exposure;
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn compute_god_rays_step_size(out: &mut [f32; 2], effect: &GodRaysEffect, px: f32, py: f32) {
    let cx = effect.center_x.unwrap_or(0.5);
    let cy = effect.center_y.unwrap_or(0.5);
    let density = effect.density.unwrap_or(0.96);
    let samples = effect.samples.unwrap_or(100.0).max(1.0);
    out[0] = ((cx - px) * density) / samples;
    out[1] = ((cy - py) * density) / samples;
}
