use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct SmaaEffect {
    fields: crate::contract::EffectFields,
    pub threshold: Option<f32>,
}

crate::impl_effect!(SmaaEffect, "threshold" => threshold);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_smaa_effect() -> Ref<SmaaEffect> {
    let mut out = allocate_entity();
    initialize_smaa_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_smaa_effect(out: &mut SmaaEffect) {
    initialize_effect(out, "SmaaEffect");
}
