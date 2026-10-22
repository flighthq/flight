use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct ChromaticAberrationEffect {
    fields: crate::contract::EffectFields,
    pub intensity: Option<f32>,
    pub radial: Option<bool>,
}

crate::impl_effect!(ChromaticAberrationEffect, "intensity" => intensity, "radial" => radial);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_chromatic_aberration_effect() -> Ref<ChromaticAberrationEffect> {
    let mut out = allocate_entity();
    initialize_chromatic_aberration_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_chromatic_aberration_effect(out: &mut ChromaticAberrationEffect) {
    initialize_effect(out, "ChromaticAberrationEffect");
}
