use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct SketchEffect {
    fields: crate::contract::EffectFields,
    pub strength: Option<f32>,
}

crate::impl_effect!(SketchEffect, "strength" => strength);

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn create_sketch_effect() -> Ref<SketchEffect> {
    let mut out = allocate_entity();
    initialize_sketch_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field/options arguments
pub fn initialize_sketch_effect(out: &mut SketchEffect) {
    initialize_effect(out, "SketchEffect");
}
