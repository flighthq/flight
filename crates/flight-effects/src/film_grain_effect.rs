use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct FilmGrainEffect {
    fields: crate::contract::EffectFields,
    pub intensity: Option<f32>,
    pub size: Option<f32>,
    pub seed: Option<f32>,
}

crate::impl_effect!(FilmGrainEffect, "intensity" => intensity, "size" => size, "seed" => seed);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_film_grain_effect() -> Ref<FilmGrainEffect> {
    let mut out = allocate_entity();
    initialize_film_grain_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_film_grain_effect(out: &mut FilmGrainEffect) {
    initialize_effect(out, "FilmGrainEffect");
}
