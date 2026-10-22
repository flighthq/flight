use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct FxaaEffect {
    fields: crate::contract::EffectFields,
    pub edge_threshold: Option<f32>,
    pub subpixel: Option<f32>,
}

crate::impl_effect!(FxaaEffect, "edgeThreshold" => edge_threshold, "subpixel" => subpixel);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_fxaa_effect() -> Ref<FxaaEffect> {
    let mut out = allocate_entity();
    initialize_fxaa_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_fxaa_effect(out: &mut FxaaEffect) {
    initialize_effect(out, "FxaaEffect");
}
