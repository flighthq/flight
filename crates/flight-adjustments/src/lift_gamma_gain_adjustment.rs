use std::sync::Arc;

use flight_entity::allocate_entity;

use crate::contract::AdjustmentFields;
use crate::contract::initialize_color_lut_adjustment;
use crate::color_lut_adjustment::{clamp01, unpack_rgb};

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn new_matches_create_lift_gamma_gain_adjustment() {
        let a = LiftGammaGainAdjustment::new(None);
        let b = create_lift_gamma_gain_adjustment(None);
        assert_eq!(a.kind, b.kind);
        let mut ra = [0.0; 3];
        let mut rb = [0.0; 3];
        (a.transform.as_ref().unwrap())(&mut ra, 0.3, 0.5, 0.7);
        (b.transform.as_ref().unwrap())(&mut rb, 0.3, 0.5, 0.7);
        assert_eq!(ra, rb);
    }
}

/// Lift/gamma/gain as a LUT-tier adjustment (gamma is the nonlinear part). Packed-RGBA neutrals:
/// lift 0x000000ff, gamma 0x808080ff, gain 0xffffffff.
#[derive(Debug, Clone)]
pub struct LiftGammaGainAdjustment {
    fields: AdjustmentFields,
    pub lift: u32,
    pub gamma: u32,
    pub gain: u32,
}

/// Options for `create_lift_gamma_gain_adjustment` (TS: the options object). Every field is optional; defaults apply inside.
#[derive(Debug, Clone, Default)]
pub struct LiftGammaGainAdjustmentOptions {
    pub lift: Option<u32>,
    pub gamma: Option<u32>,
    pub gain: Option<u32>,
}

// flight-lint: allow(conform-params) D23 C: options derive the LGG color matrix from packed RGBA lift/gamma/gain — KEEP under c0f9227c
pub fn create_lift_gamma_gain_adjustment(options: Option<&LiftGammaGainAdjustmentOptions>) -> LiftGammaGainAdjustment {
    let mut out: LiftGammaGainAdjustment = allocate_entity();
    initialize_lift_gamma_gain_adjustment(&mut out, options);
    return out;
}

// flight-lint: allow(conform-params) D23 C: options derive the LGG color matrix from packed RGBA lift/gamma/gain — KEEP under c0f9227c
pub fn initialize_lift_gamma_gain_adjustment(out: &mut LiftGammaGainAdjustment, options: Option<&LiftGammaGainAdjustmentOptions>) {
    let lift = options.and_then(|o| o.lift).unwrap_or(0x000000ff);
    let gamma = options.and_then(|o| o.gamma).unwrap_or(0x808080ff);
    let gain = options.and_then(|o| o.gain).unwrap_or(0xffffffff);
    let lift_rgb = unpack_rgb(lift);
    let gamma_raw = unpack_rgb(gamma);
    let gain_rgb = unpack_rgb(gain);
    let gamma_exp: [f32; 3] = [
        1.0 / (gamma_raw[0] * 2.0).max(1e-3),
        1.0 / (gamma_raw[1] * 2.0).max(1e-3),
        1.0 / (gamma_raw[2] * 2.0).max(1e-3),
    ];
    let transform: crate::contract::ColorTransformFunction = Arc::new(move |o: &mut [f32; 3], r: f32, g: f32, b: f32| {
        lift_gamma_gain_transform(lift_rgb, gamma_exp, gain_rgb, o, r, g, b);
    });
    initialize_color_lut_adjustment(out, "LiftGammaGainAdjustment", transform);
    out.lift = lift;
    out.gamma = gamma;
    out.gain = gain;
}

fn lift_gamma_gain_transform(lift: [f32; 3], gamma_exp: [f32; 3], gain: [f32; 3], out: &mut [f32; 3], r: f32, g: f32, b: f32) {
    out[0] = clamp01(((r * gain[0] + lift[0] * (1.0 - r)).max(0.0)).powf(gamma_exp[0]));
    out[1] = clamp01(((g * gain[1] + lift[1] * (1.0 - g)).max(0.0)).powf(gamma_exp[1]));
    out[2] = clamp01(((b * gain[2] + lift[2] * (1.0 - b)).max(0.0)).powf(gamma_exp[2]));
}

impl Default for LiftGammaGainAdjustment {
    fn default() -> Self {
        return Self {
            fields: AdjustmentFields::default(),
            lift: 0x000000ff,
            gamma: 0x808080ff,
            gain: 0xffffffff,
        };
    }
}

impl LiftGammaGainAdjustment {
    pub fn new(options: Option<&LiftGammaGainAdjustmentOptions>) -> Self {
        return create_lift_gamma_gain_adjustment(options);
    }
}

crate::impl_adjustment!(LiftGammaGainAdjustment, "lift" => lift, "gamma" => gamma, "gain" => gain);
