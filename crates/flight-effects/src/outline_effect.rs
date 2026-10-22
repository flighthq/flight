// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState dispatch keeps padding and capture logic backend-neutral
use crate::contract::{initialize_effect, register_effect_padding_resolver};
use crate::effect_padding::resolve_typed_effect_padding;
use flight_entity::{Ref, UnknownValue, allocate_entity};
use flight_render::{EffectPadding, RenderState};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct OutlineEffect {
    fields: crate::contract::EffectFields,
    pub threshold: Option<f32>,
    pub thickness: Option<f32>,
    pub color: Option<u32>,
}

crate::impl_effect!(OutlineEffect, "threshold" => threshold, "thickness" => thickness, "color" => color);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_outline_effect() -> Ref<OutlineEffect> {
    let mut out = allocate_entity();
    initialize_outline_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_outline_effect(out: &mut OutlineEffect) {
    initialize_effect(out, "OutlineEffect");
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_outline_effect_padding(out: &mut EffectPadding, effect: &OutlineEffect) {
    let thickness = effect.thickness.unwrap_or(1.0).max(0.0).ceil();
    *out = EffectPadding {
        bottom: thickness,
        left: thickness,
        right: thickness,
        top: thickness,
    };
}

pub fn register_outline_effect_padding_resolver<S: RenderState>(state: &mut S) {
    register_effect_padding_resolver(state, "OutlineEffect", Some(resolve_outline_effect_padding));
}

fn resolve_outline_effect_padding(value: &UnknownValue) -> EffectPadding {
    return resolve_typed_effect_padding::<OutlineEffect>(value, get_outline_effect_padding);
}
