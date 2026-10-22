use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct ScanlinesEffect {
    fields: crate::contract::EffectFields,
    pub count: Option<f32>,
    pub intensity: Option<f32>,
}

crate::impl_effect!(ScanlinesEffect, "count" => count, "intensity" => intensity);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_scanlines_effect() -> Ref<ScanlinesEffect> {
    let mut out = allocate_entity();
    initialize_scanlines_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_scanlines_effect(out: &mut ScanlinesEffect) {
    initialize_effect(out, "ScanlinesEffect");
}
