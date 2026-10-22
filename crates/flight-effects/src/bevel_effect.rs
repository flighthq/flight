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
pub struct BevelEffect {
    fields: crate::contract::EffectFields,
    pub angle: Option<f32>,
    pub bevel_type: Option<BevelType>,
    pub blur_x: Option<f32>,
    pub blur_y: Option<f32>,
    pub distance: Option<f32>,
    pub highlight_alpha: Option<f32>,
    pub highlight_color: Option<u32>,
    pub quality: Option<f32>,
    pub shadow_alpha: Option<f32>,
    pub shadow_color: Option<u32>,
    pub source_mode: Option<EffectSourceMode>,
    pub strength: Option<f32>,
}

crate::impl_effect!(BevelEffect, "angle" => angle, "bevelType" => bevel_type, "blurX" => blur_x, "blurY" => blur_y, "distance" => distance, "highlightAlpha" => highlight_alpha, "highlightColor" => highlight_color, "quality" => quality, "shadowAlpha" => shadow_alpha, "shadowColor" => shadow_color, "sourceMode" => source_mode, "strength" => strength);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_bevel_effect() -> Ref<BevelEffect> {
    let mut out = allocate_entity();
    initialize_bevel_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_bevel_effect(out: &mut BevelEffect) {
    initialize_effect(out, "BevelEffect");
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_bevel_effect_padding(out: &mut EffectPadding, effect: &BevelEffect) {
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

pub fn register_bevel_effect_padding_resolver<S: RenderState>(state: &mut S) {
    register_effect_padding_resolver(state, "BevelEffect", Some(resolve_bevel_effect_padding));
}

fn resolve_bevel_effect_padding(value: &UnknownValue) -> EffectPadding {
    return resolve_typed_effect_padding::<BevelEffect>(value, get_bevel_effect_padding);
}
