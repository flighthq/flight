use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct PanniniProjectionEffect {
    fields: crate::contract::EffectFields,
    pub compression: Option<f32>,
    pub crop: Option<f32>,
}

crate::impl_effect!(PanniniProjectionEffect, "compression" => compression, "crop" => crop);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_pannini_projection_effect() -> Ref<PanniniProjectionEffect> {
    let mut out = allocate_entity();
    initialize_pannini_projection_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_pannini_projection_effect(out: &mut PanniniProjectionEffect) {
    initialize_effect(out, "PanniniProjectionEffect");
}
