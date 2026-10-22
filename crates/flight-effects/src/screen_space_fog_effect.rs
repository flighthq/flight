use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct ScreenSpaceFogEffect {
    fields: crate::contract::EffectFields,
    pub color: Option<u32>,
    pub near: Option<f32>,
    pub far: Option<f32>,
    pub density: Option<f32>,
}

crate::impl_effect!(ScreenSpaceFogEffect, "color" => color, "near" => near, "far" => far, "density" => density);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_screen_space_fog_effect() -> Ref<ScreenSpaceFogEffect> {
    let mut out = allocate_entity();
    initialize_screen_space_fog_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_screen_space_fog_effect(out: &mut ScreenSpaceFogEffect) {
    initialize_effect(out, "ScreenSpaceFogEffect");
}
