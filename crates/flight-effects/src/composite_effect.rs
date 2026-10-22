use crate::contract::initialize_effect;
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct CompositeEffect {
    fields: crate::contract::EffectFields,
    pub operator: String,
    pub backdrop_key: Option<String>,
}

crate::impl_effect!(CompositeEffect, "operator" => operator, "backdropKey" => backdrop_key);

// flight-lint: allow(conform-params) D23 entity construction takes no field arguments
pub fn create_composite_effect() -> Ref<CompositeEffect> {
    let mut out = allocate_entity();
    initialize_composite_effect(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D23 entity construction takes no field arguments
pub fn initialize_composite_effect(out: &mut CompositeEffect) {
    initialize_effect(out, "CompositeEffect");
}
