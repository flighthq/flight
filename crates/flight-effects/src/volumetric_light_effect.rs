use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct VolumetricLightEffect {
    fields: crate::contract::EffectFields,
    pub density: Option<f32>,
    pub light_color: Option<u32>,
    pub light_x: Option<f32>,
    pub light_y: Option<f32>,
    pub samples: Option<f32>,
    pub scattering: Option<f32>,
}

crate::impl_effect!(VolumetricLightEffect, "density" => density, "lightColor" => light_color, "lightX" => light_x, "lightY" => light_y, "samples" => samples, "scattering" => scattering);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_volumetric_light_effect() -> Ref<VolumetricLightEffect> {
    let mut out = allocate_entity();
    initialize_volumetric_light_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_volumetric_light_effect(out: &mut VolumetricLightEffect) {
    initialize_effect(out, "VolumetricLightEffect");
}
