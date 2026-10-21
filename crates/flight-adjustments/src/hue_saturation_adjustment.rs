use std::sync::Arc;

use flight_entity::allocate_entity;

use crate::contract::AdjustmentFields;
use crate::contract::initialize_color_lut_adjustment;
use crate::color_lut_adjustment::{clamp01, fract, hue2rgb};

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn new_matches_create_hue_saturation_adjustment() {
        let a = HueSaturationAdjustment::new(None);
        let b = create_hue_saturation_adjustment(None);
        assert_eq!(a.kind, b.kind);
        let mut ra = [0.0; 3];
        let mut rb = [0.0; 3];
        (a.transform.as_ref().unwrap())(&mut ra, 0.3, 0.5, 0.7);
        (b.transform.as_ref().unwrap())(&mut rb, 0.3, 0.5, 0.7);
        assert_eq!(ra, rb);
    }
}

/// Hue/saturation/lightness as a LUT-tier adjustment. The transform is the exact HSL round-trip
/// from the old hueSaturationEffect shader.
#[derive(Debug, Clone)]
pub struct HueSaturationAdjustment {
    fields: AdjustmentFields,
    pub hue: f32,
    pub saturation: f32,
    pub lightness: f32,
}

/// Options for `create_hue_saturation_adjustment` (TS: the options object). Every field is optional; defaults apply inside.
#[derive(Debug, Clone, Default)]
pub struct HueSaturationAdjustmentOptions {
    pub hue: Option<f32>,
    pub saturation: Option<f32>,
    pub lightness: Option<f32>,
}

pub fn create_hue_saturation_adjustment(options: Option<&HueSaturationAdjustmentOptions>) -> HueSaturationAdjustment {
    let mut out: HueSaturationAdjustment = allocate_entity();
    initialize_hue_saturation_adjustment(&mut out, options);
    return out;
}

pub fn initialize_hue_saturation_adjustment(out: &mut HueSaturationAdjustment, options: Option<&HueSaturationAdjustmentOptions>) {
    let hue = options.and_then(|o| o.hue).unwrap_or(0.0);
    let saturation = options.and_then(|o| o.saturation).unwrap_or(1.0);
    let lightness = options.and_then(|o| o.lightness).unwrap_or(0.0);
    let transform: crate::contract::ColorTransformFunction = Arc::new(move |o: &mut [f32; 3], r: f32, g: f32, b: f32| {
        hue_saturation_transform(hue, saturation, lightness, o, r, g, b);
    });
    initialize_color_lut_adjustment(out, "HueSaturationAdjustment", transform);
    out.hue = hue;
    out.saturation = saturation;
    out.lightness = lightness;
}

fn hue_saturation_transform(hue: f32, saturation: f32, lightness: f32, out: &mut [f32; 3], r: f32, g: f32, b: f32) {
    let hue_offset = hue / 360.0;
    let mx = r.max(g).max(b);
    let mn = r.min(g).min(b);
    let mut h = 0.0_f32;
    let mut s = 0.0_f32;
    let l = (mx + mn) * 0.5;
    let d = mx - mn;
    if d > 0.0001 {
        s = if l < 0.5 { d / (mx + mn) } else { d / (2.0 - mx - mn) };
        if mx == r {
            h = (g - b) / d + (if g < b { 6.0 } else { 0.0 });
        } else if mx == g {
            h = (b - r) / d + 2.0;
        } else {
            h = (r - g) / d + 4.0;
        }
        h /= 6.0;
    }
    h = fract(h + hue_offset);
    s = clamp01(s * saturation);
    let ln = clamp01(l + lightness);
    if s <= 0.0 {
        out[0] = ln;
        out[1] = ln;
        out[2] = ln;
        return;
    }
    let q = if ln < 0.5 { ln * (1.0 + s) } else { ln + s - ln * s };
    let p = 2.0 * ln - q;
    out[0] = hue2rgb(p, q, h + 1.0 / 3.0);
    out[1] = hue2rgb(p, q, h);
    out[2] = hue2rgb(p, q, h - 1.0 / 3.0);
}

impl Default for HueSaturationAdjustment {
    fn default() -> Self {
        return Self {
            fields: AdjustmentFields::default(),
            hue: 0.0,
            saturation: 1.0,
            lightness: 0.0,
        };
    }
}

impl HueSaturationAdjustment {
    pub fn new(options: Option<&HueSaturationAdjustmentOptions>) -> Self {
        return create_hue_saturation_adjustment(options);
    }
}

crate::impl_adjustment!(HueSaturationAdjustment, "hue" => hue, "saturation" => saturation, "lightness" => lightness);
