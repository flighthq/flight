use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct FilmEmulationEffect {
    fields: crate::contract::EffectFields,
    pub gate_weave: Option<f32>,
    pub grain_intensity: Option<f32>,
    pub halation_radius: Option<f32>,
    pub halation_strength: Option<f32>,
}

crate::impl_effect!(FilmEmulationEffect, "gateWeave" => gate_weave, "grainIntensity" => grain_intensity, "halationRadius" => halation_radius, "halationStrength" => halation_strength);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_film_emulation_effect() -> Ref<FilmEmulationEffect> {
    let mut out = allocate_entity();
    initialize_film_emulation_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_film_emulation_effect(out: &mut FilmEmulationEffect) {
    initialize_effect(out, "FilmEmulationEffect");
}
