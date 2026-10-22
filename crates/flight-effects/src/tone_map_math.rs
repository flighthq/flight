use crate::contract::{AgxToneMapOptions, FilmicToneMapOptions};

fn agx_default_contrast_approx(x: f32) -> f32 {
    let x2 = x * x;
    let x4 = x2 * x2;
    return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x
        + 0.4298 * x2
        + 0.1191 * x
        - 0.00232;
}

pub fn compute_aces_tone_map(x: f32) -> f32 {
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    return ((x * (a * x + b)) / (x * (c * x + d) + e)).clamp(0.0, 1.0);
}

pub fn compute_agx_tone_map(x: f32, options: Option<&AgxToneMapOptions>) -> f32 {
    let min_ev = options.and_then(|value| value.min_ev).unwrap_or(-12.47393);
    let max_ev = options.and_then(|value| value.max_ev).unwrap_or(4.026069);
    let value = x.max(1e-10);
    let log = value.log2().clamp(min_ev, max_ev);
    return agx_default_contrast_approx((log - min_ev) / (max_ev - min_ev));
}

pub fn compute_exposure_scale(exposure: f32) -> f32 {
    return 2.0_f32.powf(exposure);
}

pub fn compute_filmic_tone_map(x: f32, options: Option<&FilmicToneMapOptions>) -> f32 {
    let max_brightness = options
        .and_then(|value| value.max_brightness)
        .unwrap_or(1.0);
    let contrast = options.and_then(|value| value.contrast).unwrap_or(1.0);
    let linear_start = options.and_then(|value| value.linear_start).unwrap_or(0.22);
    let linear_length = options.and_then(|value| value.linear_length).unwrap_or(0.4);
    let black_tighten = options
        .and_then(|value| value.black_tighten)
        .unwrap_or(1.33);
    let pedestal = options.and_then(|value| value.pedestal).unwrap_or(0.0);
    let l0 = ((max_brightness - linear_start) * linear_length) / contrast;
    let lower = linear_start - linear_start / contrast;
    let upper = linear_start + (1.0 - linear_start) / contrast;
    let shoulder_start = linear_start + l0;
    let shoulder_value = linear_start + contrast * l0;
    let c2 = contrast / (max_brightness - shoulder_value);
    let cp = -c2 / 2.0_f32.ln();
    let w0 = 1.0 - smoothstep01(linear_start, shoulder_start, x);
    let toe = linear_start * (x / linear_start).powf(black_tighten) + pedestal;
    let linear = linear_start + contrast * (x - linear_start);
    let shoulder =
        max_brightness - (max_brightness - shoulder_value) * (cp * (x - shoulder_start)).exp();
    let mix = smoothstep01(lower, upper, x);
    return (w0 * (1.0 - mix) * toe + mix * linear + (1.0 - w0) * shoulder).max(0.0);
}

pub fn compute_reinhard_extended_tone_map(x: f32, white: f32) -> f32 {
    let white_squared = white * white;
    return (x * (1.0 + x / white_squared)) / (1.0 + x);
}

pub fn compute_reinhard_tone_map(x: f32) -> f32 {
    return x / (1.0 + x);
}

pub fn compute_uncharted_2_tone_map(x: f32) -> f32 {
    let a = 0.15;
    let b = 0.5;
    let c = 0.1;
    let d = 0.2;
    let e = 0.02;
    let f = 0.3;
    return (x * (a * x + c * b) + d * e) / (x * (a * x + b) + d * f) - e / f;
}

pub fn get_aces_input_matrix(out: &mut [f32]) {
    out[..9].copy_from_slice(&[
        0.59719, 0.076, 0.0284, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777,
    ]);
}

pub fn get_aces_output_matrix(out: &mut [f32]) {
    out[..9].copy_from_slice(&[
        1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602,
    ]);
}

fn smoothstep01(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = ((x - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}
