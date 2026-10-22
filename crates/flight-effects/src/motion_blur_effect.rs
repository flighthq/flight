use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct MotionBlurEffect {
    fields: crate::contract::EffectFields,
    pub intensity: Option<f32>,
    pub samples: Option<f32>,
}

crate::impl_effect!(MotionBlurEffect, "intensity" => intensity, "samples" => samples);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_motion_blur_effect() -> Ref<MotionBlurEffect> {
    let mut out = allocate_entity();
    initialize_motion_blur_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_motion_blur_effect(out: &mut MotionBlurEffect) {
    initialize_effect(out, "MotionBlurEffect");
}
