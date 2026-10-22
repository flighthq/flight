// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState dispatch keeps padding and capture logic backend-neutral
use crate::contract::{initialize_effect, register_effect_padding_resolver};
use crate::effect_padding::resolve_typed_effect_padding;
use flight_entity::{Ref, UnknownValue, allocate_entity};
use flight_render::{EffectPadding, RenderState};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct DisplacementEffect {
    fields: crate::contract::EffectFields,
    pub intensity: Option<f32>,
    pub frequency: Option<f32>,
    pub seed: Option<f32>,
}

crate::impl_effect!(DisplacementEffect, "intensity" => intensity, "frequency" => frequency, "seed" => seed);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_displacement_effect() -> Ref<DisplacementEffect> {
    let mut out = allocate_entity();
    initialize_displacement_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_displacement_effect(out: &mut DisplacementEffect) {
    initialize_effect(out, "DisplacementEffect");
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_displacement_effect_padding(out: &mut EffectPadding, effect: &DisplacementEffect) {
    let intensity = effect.intensity.unwrap_or(8.0).abs();
    let horizontal = (intensity * 1.5).ceil();
    let vertical = intensity.ceil();
    *out = EffectPadding {
        bottom: vertical,
        left: horizontal,
        right: horizontal,
        top: vertical,
    };
}

pub fn register_displacement_effect_padding_resolver<S: RenderState>(state: &mut S) {
    register_effect_padding_resolver(
        state,
        "DisplacementEffect",
        Some(resolve_displacement_effect_padding),
    );
}

fn resolve_displacement_effect_padding(value: &UnknownValue) -> EffectPadding {
    return resolve_typed_effect_padding::<DisplacementEffect>(
        value,
        get_displacement_effect_padding,
    );
}
