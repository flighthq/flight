// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState dispatch keeps padding and capture logic backend-neutral
use crate::contract::{
    get_gaussian_effect_padding, initialize_effect, register_effect_padding_resolver,
};
use crate::effect_padding::resolve_typed_effect_padding;
use flight_entity::{Ref, UnknownValue, allocate_entity};
use flight_render::{EffectPadding, RenderState};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct BloomEffect {
    fields: crate::contract::EffectFields,
    pub threshold: Option<f32>,
    pub intensity: Option<f32>,
    pub radius: Option<f32>,
    pub passes: Option<f32>,
}

crate::impl_effect!(BloomEffect, "threshold" => threshold, "intensity" => intensity, "radius" => radius, "passes" => passes);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_bloom_effect() -> Ref<BloomEffect> {
    let mut out = allocate_entity();
    initialize_bloom_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_bloom_effect(out: &mut BloomEffect) {
    initialize_effect(out, "BloomEffect");
}

pub fn compute_bloom_blur_radius(effect: &BloomEffect) -> f32 {
    return effect.radius.unwrap_or(8.0).max(0.0);
}

pub fn compute_bloom_intensity(effect: &BloomEffect) -> f32 {
    return effect.intensity.unwrap_or(1.0);
}

pub fn compute_bloom_threshold(effect: &BloomEffect) -> f32 {
    return effect.threshold.unwrap_or(0.8);
}

// flight-lint: allow(conform-params) D24 requires the caller-owned out parameter first
pub fn get_bloom_effect_padding(out: &mut EffectPadding, effect: &BloomEffect) {
    let sigma = compute_bloom_blur_radius(effect);
    get_gaussian_effect_padding(out, sigma, sigma);
}

pub fn register_bloom_effect_padding_resolver<S: RenderState>(state: &mut S) {
    register_effect_padding_resolver(state, "BloomEffect", Some(resolve_bloom_effect_padding));
}

fn resolve_bloom_effect_padding(value: &UnknownValue) -> EffectPadding {
    return resolve_typed_effect_padding::<BloomEffect>(value, get_bloom_effect_padding);
}
