//! flight-compiler: target-native

use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
// flight-lint: allow(f64) public pixel-valued descriptor parameters are f64 CPU/API values (foreman-66f8c2c6); shader and normalized parameters stay f32
pub struct SsrEffect {
    fields: crate::contract::EffectFields,
    pub max_distance: Option<f64>,
    pub resolution: Option<f32>,
    pub steps: Option<f32>,
}

crate::impl_effect!(SsrEffect, "maxDistance" => max_distance, "resolution" => resolution, "steps" => steps);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_ssr_effect() -> Ref<SsrEffect> {
    let mut out: SsrEffect = allocate_entity();
    initialize_ssr_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_ssr_effect(out: &mut SsrEffect) {
    initialize_effect(out, "SsrEffect");
}
