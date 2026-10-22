use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct AutoExposureEffect {
    fields: crate::contract::EffectFields,
    pub adaptation_speed: Option<f32>,
    pub exposure_compensation: Option<f32>,
    pub max_exposure: Option<f32>,
    pub min_exposure: Option<f32>,
}

crate::impl_effect!(AutoExposureEffect, "adaptationSpeed" => adaptation_speed, "exposureCompensation" => exposure_compensation, "maxExposure" => max_exposure, "minExposure" => min_exposure);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_auto_exposure_effect() -> Ref<AutoExposureEffect> {
    let mut out = allocate_entity();
    initialize_auto_exposure_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_auto_exposure_effect(out: &mut AutoExposureEffect) {
    initialize_effect(out, "AutoExposureEffect");
}
