// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState dispatch keeps padding and capture logic backend-neutral
use crate::contract::{
    BevelType, EffectSourceMode, get_directional_effect_padding, initialize_effect,
    register_effect_padding_resolver,
};
use crate::effect_padding::resolve_typed_effect_padding;
use flight_entity::{Ref, UnknownValue, allocate_entity};
use flight_render::{EffectPadding, RenderState};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct GradientBevelEffect {
    fields: crate::contract::EffectFields,
    pub alphas: Vec<f32>,
    pub angle: Option<f32>,
    pub bevel_type: Option<BevelType>,
    pub blur_x: Option<f32>,
    pub blur_y: Option<f32>,
    pub colors: Vec<u32>,
    pub distance: Option<f32>,
    pub quality: Option<f32>,
    pub ratios: Vec<f32>,
    pub source_mode: Option<EffectSourceMode>,
    pub strength: Option<f32>,
}

crate::impl_effect!(GradientBevelEffect, "alphas" => alphas, "angle" => angle, "bevelType" => bevel_type, "blurX" => blur_x, "blurY" => blur_y, "colors" => colors, "distance" => distance, "quality" => quality, "ratios" => ratios, "sourceMode" => source_mode, "strength" => strength);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_gradient_bevel_effect() -> Ref<GradientBevelEffect> {
    let mut out = allocate_entity();
    initialize_gradient_bevel_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_gradient_bevel_effect(out: &mut GradientBevelEffect) {
    initialize_effect(out, "GradientBevelEffect");
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_gradient_bevel_effect_padding(out: &mut EffectPadding, effect: &GradientBevelEffect) {
    let angle = effect.angle.unwrap_or(45.0).to_radians();
    let distance = effect.distance.unwrap_or(4.0);
    get_directional_effect_padding(
        out,
        effect.blur_x.unwrap_or(4.0),
        effect.blur_y.unwrap_or(4.0),
        angle.cos() * distance,
        angle.sin() * distance,
    );
}

pub fn register_gradient_bevel_effect_padding_resolver<S: RenderState>(state: &mut S) {
    register_effect_padding_resolver(
        state,
        "GradientBevelEffect",
        Some(resolve_gradient_bevel_effect_padding),
    );
}

fn resolve_gradient_bevel_effect_padding(value: &UnknownValue) -> EffectPadding {
    return resolve_typed_effect_padding::<GradientBevelEffect>(
        value,
        get_gradient_bevel_effect_padding,
    );
}
