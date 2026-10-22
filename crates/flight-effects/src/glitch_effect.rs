// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState dispatch keeps padding and capture logic backend-neutral
use crate::contract::{initialize_effect, register_effect_padding_resolver};
use crate::effect_padding::resolve_typed_effect_padding;
use flight_entity::{Ref, UnknownValue, allocate_entity};
use flight_render::{EffectPadding, RenderState};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct GlitchEffect {
    fields: crate::contract::EffectFields,
    pub intensity: Option<f32>,
    pub block_size: Option<f32>,
    pub color_shift: Option<f32>,
    pub seed: Option<f32>,
}

crate::impl_effect!(GlitchEffect, "intensity" => intensity, "blockSize" => block_size, "colorShift" => color_shift, "seed" => seed);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_glitch_effect() -> Ref<GlitchEffect> {
    let mut out = allocate_entity();
    initialize_glitch_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_glitch_effect(out: &mut GlitchEffect) {
    initialize_effect(out, "GlitchEffect");
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_glitch_effect_padding(out: &mut EffectPadding, effect: &GlitchEffect) {
    let horizontal = (effect.intensity.unwrap_or(0.5).abs() * 40.0
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
