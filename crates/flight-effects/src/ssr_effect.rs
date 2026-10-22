use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct SsrEffect {
    fields: crate::contract::EffectFields,
    pub max_distance: Option<f32>,
    pub resolution: Option<f32>,
    pub steps: Option<f32>,
}

crate::impl_effect!(SsrEffect, "maxDistance" => max_distance, "resolution" => resolution, "steps" => steps);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_ssr_effect() -> Ref<SsrEffect> {
    let mut out = allocate_entity();
    initialize_ssr_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_ssr_effect(out: &mut SsrEffect) {
    initialize_effect(out, "SsrEffect");
}
