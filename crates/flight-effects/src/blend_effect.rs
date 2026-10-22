use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct BlendEffect {
    fields: crate::contract::EffectFields,
    pub mode: String,
    pub backdrop_key: Option<String>,
    pub opacity: Option<f32>,
}

crate::impl_effect!(BlendEffect, "mode" => mode, "backdropKey" => backdrop_key, "opacity" => opacity);

// flight-lint: allow(conform-params) D23 entity construction takes no field arguments
pub fn create_blend_effect() -> Ref<BlendEffect> {
    let mut out = allocate_entity();
    initialize_blend_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field arguments
pub fn initialize_blend_effect(out: &mut BlendEffect) {
    initialize_effect(out, "BlendEffect");
}
