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

pub fn create_toon_modifier(options: &ToonModifierOptions) -> ToonModifier {
    let mut out: ToonModifier = allocate_entity();
    initialize_toon_modifier(&mut out, options);
    return out;
}

pub fn initialize_toon_modifier(out: &mut ToonModifier, options: &ToonModifierOptions) {
    initialize_modifier(
        out,
        TOON_MODIFIER_KIND.to_string(),
        MODIFIER_SLOT_EFFECT.to_string(),
    );
    out.steps = options.steps;
    out.smoothness = options.smoothness.unwrap_or(0.0);
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
