use flight_entity::allocate_entity;

use crate::contract::{MODIFIER_SLOT_EFFECT, ModifierFields, initialize_modifier};

pub const RIM_MODIFIER_KIND: &str = "RimModifier";

#[derive(Clone, Debug)]
pub struct RimModifier {
    fields: ModifierFields,
    pub color: u32,
    pub power: f32,
    pub intensity: f32,
    pub bias: f32,
}

#[derive(Clone, Copy, Debug)]
pub struct RimModifierOptions {
    pub color: u32,
    pub power: Option<f32>,
    pub intensity: Option<f32>,
    pub bias: Option<f32>,
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): callers assign authored modifier fields after construction
pub fn create_rim_modifier() -> RimModifier {
    let mut out: RimModifier = allocate_entity();
    initialize_rim_modifier(&mut out);
    return out;
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): initialization restores canonical defaults before authored assignment
pub fn initialize_rim_modifier(out: &mut RimModifier) {
    initialize_modifier(
        out,
        RIM_MODIFIER_KIND.to_string(),
        MODIFIER_SLOT_EFFECT.to_string(),
    );
    out.color = 0;
    out.power = 3.0;
    out.intensity = 1.0;
    out.bias = 0.0;
    return;
}

impl Default for RimModifier {
    fn default() -> Self {
        return Self {
            fields: ModifierFields::default(),
            color: 0,
            power: 3.0,
            intensity: 1.0,
            bias: 0.0,
        };
    }
}

crate::impl_modifier!(RimModifier);
