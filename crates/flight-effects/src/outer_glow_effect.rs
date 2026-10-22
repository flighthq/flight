// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState dispatch keeps padding and capture logic backend-neutral
use crate::contract::{
    EffectSourceMode, get_gaussian_effect_padding, initialize_effect,
    register_effect_padding_resolver,
};
use crate::effect_padding::resolve_typed_effect_padding;
use flight_entity::{Ref, UnknownValue, allocate_entity};
use flight_render::{EffectPadding, RenderState};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct OuterGlowEffect {
    fields: crate::contract::EffectFields,
    pub alpha: Option<f32>,
    pub blur_x: Option<f32>,
    pub blur_y: Option<f32>,
    pub color: Option<u32>,
    pub quality: Option<f32>,
    pub source_mode: Option<EffectSourceMode>,
    pub strength: Option<f32>,
}

crate::impl_effect!(OuterGlowEffect, "alpha" => alpha, "blurX" => blur_x, "blurY" => blur_y, "color" => color, "quality" => quality, "sourceMode" => source_mode, "strength" => strength);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_outer_glow_effect() -> Ref<OuterGlowEffect> {
    let mut out = allocate_entity();
    initialize_outer_glow_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_outer_glow_effect(out: &mut OuterGlowEffect) {
    initialize_effect(out, "OuterGlowEffect");
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_outer_glow_effect_padding(out: &mut EffectPadding, effect: &OuterGlowEffect) {
    get_gaussian_effect_padding(
        out,
        effect.blur_x.unwrap_or(6.0),
        effect.blur_y.unwrap_or(6.0),
    );
}

pub fn register_outer_glow_effect_padding_resolver<S: RenderState>(state: &mut S) {
    register_effect_padding_resolver(
        state,
        "OuterGlowEffect",
        Some(resolve_outer_glow_effect_padding),
    );
}

fn resolve_outer_glow_effect_padding(value: &UnknownValue) -> EffectPadding {
    return resolve_typed_effect_padding::<OuterGlowEffect>(value, get_outer_glow_effect_padding);
}
