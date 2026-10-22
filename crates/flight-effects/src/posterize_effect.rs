use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct PosterizeEffect {
    fields: crate::contract::EffectFields,
    pub levels: Option<f32>,
}

crate::impl_effect!(PosterizeEffect, "levels" => levels);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_posterize_effect() -> Ref<PosterizeEffect> {
    let mut out = allocate_entity();
    initialize_posterize_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_posterize_effect(out: &mut PosterizeEffect) {
    initialize_effect(out, "PosterizeEffect");
}
