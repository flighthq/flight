use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct RadialBlurEffect {
    fields: crate::contract::EffectFields,
    pub center_x: Option<f32>,
    pub center_y: Option<f32>,
    pub strength: Option<f32>,
    pub samples: Option<f32>,
}

crate::impl_effect!(RadialBlurEffect, "centerX" => center_x, "centerY" => center_y, "strength" => strength, "samples" => samples);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_radial_blur_effect() -> Ref<RadialBlurEffect> {
    let mut out = allocate_entity();
    initialize_radial_blur_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_radial_blur_effect(out: &mut RadialBlurEffect) {
    initialize_effect(out, "RadialBlurEffect");
}
