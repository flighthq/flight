//! flight-compiler: target-native

use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
// flight-lint: allow(f64) public pixel-valued descriptor parameters are f64 CPU/API values (foreman-66f8c2c6); shader and normalized parameters stay f32
pub struct PixelateEffect {
    fields: crate::contract::EffectFields,
    pub size: Option<f64>,
}

crate::impl_effect!(PixelateEffect, "size" => size);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_pixelate_effect() -> Ref<PixelateEffect> {
    let mut out: PixelateEffect = allocate_entity();
    initialize_pixelate_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_pixelate_effect(out: &mut PixelateEffect) {
    initialize_effect(out, "PixelateEffect");
}
