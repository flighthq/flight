use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct LensFlareEffect {
    fields: crate::contract::EffectFields,
    pub threshold: Option<f32>,
    pub intensity: Option<f32>,
    pub ghosts: Option<f32>,
    pub halo: Option<f32>,
}

crate::impl_effect!(LensFlareEffect, "threshold" => threshold, "intensity" => intensity, "ghosts" => ghosts, "halo" => halo);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_lens_flare_effect() -> Ref<LensFlareEffect> {
    let mut out = allocate_entity();
    initialize_lens_flare_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_lens_flare_effect(out: &mut LensFlareEffect) {
    initialize_effect(out, "LensFlareEffect");
}
