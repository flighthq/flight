use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct TaaEffect {
    fields: crate::contract::EffectFields,
    pub feedback: Option<f32>,
}

crate::impl_effect!(TaaEffect, "feedback" => feedback);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_taa_effect() -> Ref<TaaEffect> {
    let mut out = allocate_entity();
    initialize_taa_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_taa_effect(out: &mut TaaEffect) {
    initialize_effect(out, "TaaEffect");
}
