use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct GodRaysEffect {
    fields: crate::contract::EffectFields,
    pub center_x: Option<f32>,
    pub center_y: Option<f32>,
    pub density: Option<f32>,
    pub decay: Option<f32>,
    pub weight: Option<f32>,
    pub exposure: Option<f32>,
    pub samples: Option<f32>,
}

crate::impl_effect!(GodRaysEffect, "centerX" => center_x, "centerY" => center_y, "density" => density, "decay" => decay, "weight" => weight, "exposure" => exposure, "samples" => samples);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_god_rays_effect() -> Ref<GodRaysEffect> {
    let mut out = allocate_entity();
    initialize_god_rays_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_god_rays_effect(out: &mut GodRaysEffect) {
    initialize_effect(out, "GodRaysEffect");
}
