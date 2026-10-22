use flight_entity::allocate_entity;

use crate::contract::{MODIFIER_SLOT_EFFECT, ModifierFields, initialize_modifier};

pub const TOON_MODIFIER_KIND: &str = "ToonModifier";

#[derive(Clone, Debug)]
pub struct ToonModifier {
    fields: ModifierFields,
    pub steps: f32,
    pub smoothness: f32,
}

#[derive(Clone, Copy, Debug)]
pub struct ToonModifierOptions {
    pub steps: f32,
    pub smoothness: Option<f32>,
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): callers assign authored modifier fields after construction
pub fn create_toon_modifier() -> ToonModifier {
    let mut out: ToonModifier = allocate_entity();
    initialize_toon_modifier(&mut out);
    return out;
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): initialization restores canonical defaults before authored assignment
pub fn initialize_toon_modifier(out: &mut ToonModifier) {
    initialize_modifier(
        out,
        TOON_MODIFIER_KIND.to_string(),
        MODIFIER_SLOT_EFFECT.to_string(),
    );
    out.steps = 0.0;
    out.smoothness = 0.0;
    return;
}

impl Default for ToonModifier {
    fn default() -> Self {
        return Self {
            fields: ModifierFields::default(),
            steps: 0.0,
            smoothness: 0.0,
        };
    }
}

crate::impl_modifier!(ToonModifier);
