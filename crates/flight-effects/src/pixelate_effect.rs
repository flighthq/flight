use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct PixelateEffect {
    fields: crate::contract::EffectFields,
    pub size: Option<f32>,
}

crate::impl_effect!(PixelateEffect, "size" => size);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_pixelate_effect() -> Ref<PixelateEffect> {
    let mut out = allocate_entity();
    initialize_pixelate_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_pixelate_effect(out: &mut PixelateEffect) {
    initialize_effect(out, "PixelateEffect");
}
