// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState dispatch keeps padding and capture logic backend-neutral
use crate::contract::{initialize_effect, register_effect_padding_resolver};
use crate::effect_padding::resolve_typed_effect_padding;
use flight_entity::{Ref, UnknownValue, allocate_entity};
use flight_render::{EffectPadding, RenderState};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct TiltShiftEffect {
    fields: crate::contract::EffectFields,
    pub center: Option<f32>,
    pub width: Option<f32>,
    pub blur: Option<f32>,
}

crate::impl_effect!(TiltShiftEffect, "center" => center, "width" => width, "blur" => blur);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_tilt_shift_effect() -> Ref<TiltShiftEffect> {
    let mut out = allocate_entity();
    initialize_tilt_shift_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_tilt_shift_effect(out: &mut TiltShiftEffect) {
    initialize_effect(out, "TiltShiftEffect");
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_tilt_shift_effect_padding(out: &mut EffectPadding, effect: &TiltShiftEffect) {
    let vertical = (effect.blur.unwrap_or(4.0).max(0.0) * 3.0).ceil();
    *out = EffectPadding {
        bottom: vertical,
        left: 0.0,
        right: 0.0,
        top: vertical,
    };
}

pub fn register_tilt_shift_effect_padding_resolver<S: RenderState>(state: &mut S) {
    register_effect_padding_resolver(
        state,
        "TiltShiftEffect",
        Some(resolve_tilt_shift_effect_padding),
    );
}

fn resolve_tilt_shift_effect_padding(value: &UnknownValue) -> EffectPadding {
    return resolve_typed_effect_padding::<TiltShiftEffect>(value, get_tilt_shift_effect_padding);
}
