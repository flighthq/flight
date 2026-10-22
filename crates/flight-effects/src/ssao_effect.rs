use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct SsaoEffect {
    fields: crate::contract::EffectFields,
    pub radius: Option<f32>,
    pub intensity: Option<f32>,
    pub bias: Option<f32>,
    pub samples: Option<f32>,
}

crate::impl_effect!(SsaoEffect, "radius" => radius, "intensity" => intensity, "bias" => bias, "samples" => samples);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_ssao_effect() -> Ref<SsaoEffect> {
    let mut out = allocate_entity();
    initialize_ssao_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_ssao_effect(out: &mut SsaoEffect) {
    initialize_effect(out, "SsaoEffect");
}
