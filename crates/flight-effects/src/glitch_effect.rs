//! flight-compiler: target-native

// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState dispatch keeps padding and capture logic backend-neutral
use crate::contract::{initialize_effect, register_effect_padding_resolver};
use crate::effect_padding::resolve_typed_effect_padding;
use flight_entity::{Ref, UnknownValue, allocate_entity};
use flight_render::{EffectPadding, RenderState};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
// flight-lint: allow(f64) public pixel-valued descriptor parameters are f64 CPU/API values (foreman-66f8c2c6); shader and normalized parameters stay f32
pub struct GlitchEffect {
    fields: crate::contract::EffectFields,
    pub intensity: Option<f32>,
    pub block_size: Option<f64>,
    pub color_shift: Option<f64>,
    pub seed: Option<f32>,
}

crate::impl_effect!(GlitchEffect, "intensity" => intensity, "blockSize" => block_size, "colorShift" => color_shift, "seed" => seed);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_glitch_effect() -> Ref<GlitchEffect> {
    let mut out: GlitchEffect = allocate_entity();
    initialize_glitch_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_glitch_effect(out: &mut GlitchEffect) {
    initialize_effect(out, "GlitchEffect");
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
// flight-lint: allow(f64) pixel-valued effect geometry and the property protocol's Number are f64 CPU/API values (foreman-66f8c2c6); shader parameters stay f32
pub fn get_glitch_effect_padding(out: &mut EffectPadding, effect: &GlitchEffect) {
    // TS computes padding in Number from the f32 effect parameters.
    let horizontal = (f64::from(effect.intensity.unwrap_or(0.5)).abs() * 40.0
        + effect.color_shift.unwrap_or(8.0).abs() * 1.4)
        .ceil();
    *out = EffectPadding {
        bottom: 0.0,
        left: horizontal,
        right: horizontal,
        top: 0.0,
    };
}

pub fn register_glitch_effect_padding_resolver<S: RenderState>(state: &mut S) {
    register_effect_padding_resolver(state, "GlitchEffect", Some(resolve_glitch_effect_padding));
}

fn resolve_glitch_effect_padding(value: &UnknownValue) -> EffectPadding {
    return resolve_typed_effect_padding::<GlitchEffect>(value, get_glitch_effect_padding);
}
