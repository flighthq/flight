use std::sync::Arc;

use flight_entity::allocate_entity;

use crate::color_lut_adjustment::{clamp01, unpack_rgb};
use crate::contract::AdjustmentFields;
use crate::contract::initialize_color_lut_adjustment;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn new_matches_create_color_grade_adjustment() {
        let a = ColorGradeAdjustment::new(None);
        let b = create_color_grade_adjustment(None);
        assert_eq!(a.kind, b.kind);
        let mut ra = [0.0; 3];
        let mut rb = [0.0; 3];
        (a.transform.as_ref().unwrap())(&mut ra, 0.3, 0.5, 0.7);
        (b.transform.as_ref().unwrap())(&mut rb, 0.3, 0.5, 0.7);
        assert_eq!(ra, rb);
    }
}

/// The full color grade as one LUT-tier adjustment. The exposure/brightness/temperature/tint/saturation/
/// contrast pipeline is ported faithfully from the old colorGradeEffect shader; a lift/gamma/gain
/// pipeline follows it. Gamma makes the composite nonlinear, so the whole grade bakes to one LUT.
#[derive(Debug, Clone)]
pub struct ColorGradeAdjustment {
    fields: AdjustmentFields,
    pub exposure: f32,
    pub brightness: f32,
    pub contrast: f32,
    pub saturation: f32,
    pub temperature: f32,
    pub tint: f32,
    pub lift: u32,
    pub gamma: u32,
    pub gain: u32,
}

/// Options for `create_color_grade_adjustment` (TS: the options object). Every field is optional; defaults apply inside.
#[derive(Debug, Clone, Default)]
pub struct ColorGradeAdjustmentOptions {
    pub exposure: Option<f32>,
    pub brightness: Option<f32>,
    pub contrast: Option<f32>,
    pub saturation: Option<f32>,
    pub temperature: Option<f32>,
    pub tint: Option<f32>,
    pub lift: Option<u32>,
    pub gamma: Option<u32>,
    pub gain: Option<u32>,
}

/// The transform's captured, precomputed parameters (TS closes over the same locals).
#[derive(Clone, Copy)]
struct ColorGradeTransform {
    exposure_scale: f32,
    brightness: f32,
    contrast: f32,
    saturation: f32,
    temperature: f32,
    tint: f32,
    lift: [f32; 3],
    gamma_exp: [f32; 3],
    gain: [f32; 3],
}

// flight-lint: allow(conform-params) D23 C: options derive captured transform from exposure/contrast/saturation/temperature/tint/lift/gamma/gain — KEEP under c0f9227c
pub fn create_color_grade_adjustment(options: Option<&ColorGradeAdjustmentOptions>) -> ColorGradeAdjustment {
    let mut out: ColorGradeAdjustment = allocate_entity();
    initialize_color_grade_adjustment(&mut out, options);
    return out;
}

// flight-lint: allow(conform-params) D23 C: options derive captured transform from exposure/contrast/saturation/temperature/tint/lift/gamma/gain — KEEP under c0f9227c
pub fn initialize_color_grade_adjustment(out: &mut ColorGradeAdjustment, options: Option<&ColorGradeAdjustmentOptions>) {
    let exposure = options.and_then(|o| o.exposure).unwrap_or(0.0);
    let brightness = options.and_then(|o| o.brightness).unwrap_or(0.0);
    let contrast = options.and_then(|o| o.contrast).unwrap_or(1.0);
    let saturation = options.and_then(|o| o.saturation).unwrap_or(1.0);
    let temperature = options.and_then(|o| o.temperature).unwrap_or(0.0);
    let tint = options.and_then(|o| o.tint).unwrap_or(0.0);
    let lift = options.and_then(|o| o.lift).unwrap_or(0x000000ff);
    let gamma = options.and_then(|o| o.gamma).unwrap_or(0x808080ff);
    let gain = options.and_then(|o| o.gain).unwrap_or(0xffffffff);
    let exposure_scale = (2.0_f32).powf(exposure);
    let lift_rgb = unpack_rgb(lift);
    let gamma_raw = unpack_rgb(gamma);
    let gain_rgb = unpack_rgb(gain);
    let gamma_exp: [f32; 3] = [
        1.0 / (gamma_raw[0] * 2.0).max(1e-3),
        1.0 / (gamma_raw[1] * 2.0).max(1e-3),
        1.0 / (gamma_raw[2] * 2.0).max(1e-3),
    ];
    let grade = ColorGradeTransform { exposure_scale, brightness, contrast, saturation, temperature, tint, lift: lift_rgb, gamma_exp, gain: gain_rgb };
    let transform: crate::contract::ColorTransformFunction = Arc::new(move |o: &mut [f32; 3], r: f32, g: f32, b: f32| {
        color_grade_transform(&grade, o, r, g, b);
    });
    initialize_color_lut_adjustment(out, "ColorGradeAdjustment", transform);
    out.exposure = exposure;
    out.brightness = brightness;
    out.contrast = contrast;
    out.saturation = saturation;
    out.temperature = temperature;
    out.tint = tint;
    out.lift = lift;
    out.gamma = gamma;
    out.gain = gain;
}

fn color_grade_transform(a: &ColorGradeTransform, out: &mut [f32; 3], r: f32, g: f32, b: f32) {
    let mut cr = r * a.exposure_scale + a.brightness + a.temperature * 0.5;
    let mut cg = g * a.exposure_scale + a.brightness + a.tint * 0.5;
    let mut cb = b * a.exposure_scale + a.brightness - a.temperature * 0.5;
    let luma = cr * 0.2126 + cg * 0.7152 + cb * 0.0722;
    cr = luma + (cr - luma) * a.saturation;
    cg = luma + (cg - luma) * a.saturation;
    cb = luma + (cb - luma) * a.saturation;
    cr = (cr - 0.5) * a.contrast + 0.5;
    cg = (cg - 0.5) * a.contrast + 0.5;
    cb = (cb - 0.5) * a.contrast + 0.5;
    cr = ((cr * a.gain[0] + a.lift[0] * (1.0 - cr)).max(0.0)).powf(a.gamma_exp[0]);
    cg = ((cg * a.gain[1] + a.lift[1] * (1.0 - cg)).max(0.0)).powf(a.gamma_exp[1]);
    cb = ((cb * a.gain[2] + a.lift[2] * (1.0 - cb)).max(0.0)).powf(a.gamma_exp[2]);
    out[0] = clamp01(cr);
    out[1] = clamp01(cg);
    out[2] = clamp01(cb);
}

impl Default for ColorGradeAdjustment {
    fn default() -> Self {
        return Self {
            fields: AdjustmentFields::default(),
            exposure: 0.0,
            brightness: 0.0,
            contrast: 1.0,
            saturation: 1.0,
            temperature: 0.0,
            tint: 0.0,
            lift: 0x000000ff,
            gamma: 0x808080ff,
            gain: 0xffffffff,
        };
    }
}

impl ColorGradeAdjustment {
    pub fn new(options: Option<&ColorGradeAdjustmentOptions>) -> Self {
        return create_color_grade_adjustment(options);
    }
}

crate::impl_adjustment!(ColorGradeAdjustment, "exposure" => exposure, "brightness" => brightness, "contrast" => contrast, "saturation" => saturation, "temperature" => temperature, "tint" => tint, "lift" => lift, "gamma" => gamma, "gain" => gain);
