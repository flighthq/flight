use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct CrtEffect {
    fields: crate::contract::EffectFields,
    pub curvature: Option<f32>,
    pub scanline_intensity: Option<f32>,
    pub vignette: Option<f32>,
    pub aberration: Option<f32>,
}

crate::impl_effect!(CrtEffect, "curvature" => curvature, "scanlineIntensity" => scanline_intensity, "vignette" => vignette, "aberration" => aberration);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_crt_effect() -> Ref<CrtEffect> {
    let mut out = allocate_entity();
    initialize_crt_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_crt_effect(out: &mut CrtEffect) {
    initialize_effect(out, "CrtEffect");
}
