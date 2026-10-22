// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState dispatch keeps padding and capture logic backend-neutral
use crate::contract::{initialize_effect, register_effect_padding_resolver};
use crate::effect_padding::resolve_typed_effect_padding;
use flight_entity::{Ref, UnknownValue, allocate_entity};
use flight_render::{EffectPadding, RenderState};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct DirectionalBlurEffect {
    fields: crate::contract::EffectFields,
    pub angle: Option<f32>,
    pub length: Option<f32>,
    pub samples: Option<f32>,
}

crate::impl_effect!(DirectionalBlurEffect, "angle" => angle, "length" => length, "samples" => samples);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_directional_blur_effect() -> Ref<DirectionalBlurEffect> {
    let mut out = allocate_entity();
    initialize_directional_blur_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_directional_blur_effect(out: &mut DirectionalBlurEffect) {
    initialize_effect(out, "DirectionalBlurEffect");
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_directional_blur_effect_padding(
    out: &mut EffectPadding,
    effect: &DirectionalBlurEffect,
) {
    let angle = effect.angle.unwrap_or(0.0).to_radians();
    let half_length = effect.length.unwrap_or(8.0).max(0.0) * 0.5;
    let projected_x = (angle.cos() * half_length).abs();
    let projected_y = (angle.sin() * half_length).abs();
    let horizontal = if projected_x < 1e-6 {
        0.0
    } else {
        projected_x.ceil()
    };
    let vertical = if projected_y < 1e-6 {
        0.0
    } else {
        projected_y.ceil()
    };
    *out = EffectPadding {
        bottom: vertical,
        left: horizontal,
        right: horizontal,
        top: vertical,
    };
}

pub fn register_directional_blur_effect_padding_resolver<S: RenderState>(state: &mut S) {
    register_effect_padding_resolver(
        state,
        "DirectionalBlurEffect",
        Some(resolve_directional_blur_effect_padding),
    );
}

fn resolve_directional_blur_effect_padding(value: &UnknownValue) -> EffectPadding {
    return resolve_typed_effect_padding::<DirectionalBlurEffect>(
        value,
        get_directional_blur_effect_padding,
    );
}
