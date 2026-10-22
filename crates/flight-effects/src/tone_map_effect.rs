use crate::contract::{ToneMapOperator, initialize_effect};
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct ToneMapEffect {
    fields: crate::contract::EffectFields,
    pub operator: Option<ToneMapOperator>,
    pub exposure: Option<f32>,
    pub white: Option<f32>,
}

crate::impl_effect!(ToneMapEffect, "operator" => operator, "exposure" => exposure, "white" => white);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_tone_map_effect() -> Ref<ToneMapEffect> {
    let mut out = allocate_entity();
    initialize_tone_map_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_tone_map_effect(out: &mut ToneMapEffect) {
    initialize_effect(out, "ToneMapEffect");
}
