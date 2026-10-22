use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct LensDistortionEffect {
    fields: crate::contract::EffectFields,
    pub amount: Option<f32>,
    pub scale: Option<f32>,
}

crate::impl_effect!(LensDistortionEffect, "amount" => amount, "scale" => scale);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_lens_distortion_effect() -> Ref<LensDistortionEffect> {
    let mut out = allocate_entity();
    initialize_lens_distortion_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_lens_distortion_effect(out: &mut LensDistortionEffect) {
    initialize_effect(out, "LensDistortionEffect");
}
