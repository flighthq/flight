use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct SharpenEffect {
    fields: crate::contract::EffectFields,
    pub amount: Option<f32>,
}

crate::impl_effect!(SharpenEffect, "amount" => amount);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_sharpen_effect() -> Ref<SharpenEffect> {
    let mut out = allocate_entity();
    initialize_sharpen_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_sharpen_effect(out: &mut SharpenEffect) {
    initialize_effect(out, "SharpenEffect");
}
