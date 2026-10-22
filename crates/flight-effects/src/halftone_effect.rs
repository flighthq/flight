use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct HalftoneEffect {
    fields: crate::contract::EffectFields,
    pub scale: Option<f32>,
    pub angle: Option<f32>,
}

crate::impl_effect!(HalftoneEffect, "scale" => scale, "angle" => angle);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_halftone_effect() -> Ref<HalftoneEffect> {
    let mut out = allocate_entity();
    initialize_halftone_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_halftone_effect(out: &mut HalftoneEffect) {
    initialize_effect(out, "HalftoneEffect");
}
