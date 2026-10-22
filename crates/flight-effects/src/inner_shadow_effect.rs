// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState dispatch keeps padding and capture logic backend-neutral
use crate::contract::{
    InnerEffectSourceMode, get_directional_effect_padding, initialize_effect,
    register_effect_padding_resolver,
};
use crate::effect_padding::resolve_typed_effect_padding;
use flight_entity::{Ref, UnknownValue, allocate_entity};
use flight_render::{EffectPadding, RenderState};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct InnerShadowEffect {
    fields: crate::contract::EffectFields,
    pub alpha: Option<f32>,
    pub angle: Option<f32>,
    pub blur_x: Option<f32>,
    pub blur_y: Option<f32>,
    pub color: Option<u32>,
    pub distance: Option<f32>,
    pub quality: Option<f32>,
    pub source_mode: Option<InnerEffectSourceMode>,
    pub strength: Option<f32>,
}

crate::impl_effect!(InnerShadowEffect, "alpha" => alpha, "angle" => angle, "blurX" => blur_x, "blurY" => blur_y, "color" => color, "distance" => distance, "quality" => quality, "sourceMode" => source_mode, "strength" => strength);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_inner_shadow_effect() -> Ref<InnerShadowEffect> {
    let mut out = allocate_entity();
    initialize_inner_shadow_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_inner_shadow_effect(out: &mut InnerShadowEffect) {
    initialize_effect(out, "InnerShadowEffect");
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_inner_shadow_effect_padding(out: &mut EffectPadding, effect: &InnerShadowEffect) {
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

pub fn register_inner_shadow_effect_padding_resolver<S: RenderState>(state: &mut S) {
    register_effect_padding_resolver(
        state,
        "InnerShadowEffect",
        Some(resolve_inner_shadow_effect_padding),
    );
}

fn resolve_inner_shadow_effect_padding(value: &UnknownValue) -> EffectPadding {
    return resolve_typed_effect_padding::<InnerShadowEffect>(
        value,
        get_inner_shadow_effect_padding,
    );
}
