use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct WhiteBalanceEffect {
    fields: crate::contract::EffectFields,
    pub temperature: Option<f32>,
    pub tint: Option<f32>,
}

crate::impl_effect!(WhiteBalanceEffect, "temperature" => temperature, "tint" => tint);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_white_balance_effect() -> Ref<WhiteBalanceEffect> {
    let mut out = allocate_entity();
    initialize_white_balance_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_white_balance_effect(out: &mut WhiteBalanceEffect) {
    initialize_effect(out, "WhiteBalanceEffect");
}
