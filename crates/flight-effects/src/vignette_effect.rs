use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct VignetteEffect {
    fields: crate::contract::EffectFields,
    pub intensity: Option<f32>,
    pub radius: Option<f32>,
    pub softness: Option<f32>,
    pub color: Option<u32>,
}

crate::impl_effect!(VignetteEffect, "intensity" => intensity, "radius" => radius, "softness" => softness, "color" => color);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_vignette_effect() -> Ref<VignetteEffect> {
    let mut out = allocate_entity();
    initialize_vignette_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_vignette_effect(out: &mut VignetteEffect) {
    initialize_effect(out, "VignetteEffect");
}
