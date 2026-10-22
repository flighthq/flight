// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState dispatch keeps padding and capture logic backend-neutral
use crate::contract::{initialize_effect, register_effect_padding_resolver};
use crate::effect_padding::resolve_typed_effect_padding;
use flight_entity::{Ref, UnknownValue, allocate_entity};
use flight_render::{EffectPadding, RenderState};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct MedianEffect {
    fields: crate::contract::EffectFields,
    pub radius: Option<f32>,
}

crate::impl_effect!(MedianEffect, "radius" => radius);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_median_effect() -> Ref<MedianEffect> {
    let mut out = allocate_entity();
    initialize_median_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_median_effect(out: &mut MedianEffect) {
    initialize_effect(out, "MedianEffect");
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_median_effect_padding(out: &mut EffectPadding, effect: &MedianEffect) {
    let radius = (effect.radius.unwrap_or(1.0) + 0.5).floor().max(0.0);
    *out = EffectPadding {
        bottom: radius,
        left: radius,
        right: radius,
        top: radius,
    };
}

pub fn register_median_effect_padding_resolver<S: RenderState>(state: &mut S) {
    register_effect_padding_resolver(state, "MedianEffect", Some(resolve_median_effect_padding));
}

fn resolve_median_effect_padding(value: &UnknownValue) -> EffectPadding {
    return resolve_typed_effect_padding::<MedianEffect>(value, get_median_effect_padding);
}
