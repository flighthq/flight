use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct LensDirtEffect {
    fields: crate::contract::EffectFields,
    pub intensity: Option<f32>,
    pub threshold: Option<f32>,
    pub seed: Option<f32>,
}

crate::impl_effect!(LensDirtEffect, "intensity" => intensity, "threshold" => threshold, "seed" => seed);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_lens_dirt_effect() -> Ref<LensDirtEffect> {
    let mut out = allocate_entity();
    initialize_lens_dirt_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_lens_dirt_effect(out: &mut LensDirtEffect) {
    initialize_effect(out, "LensDirtEffect");
}
