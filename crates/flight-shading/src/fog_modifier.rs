use flight_entity::allocate_entity;

use crate::contract::{FogModifierMode, MODIFIER_SLOT_EFFECT, ModifierFields, initialize_modifier};

pub const FOG_MODIFIER_KIND: &str = "FogModifier";

#[derive(Clone, Debug)]
pub struct FogModifier {
    fields: ModifierFields,
    pub color: u32,
    pub mode: FogModifierMode,
    pub near: f32,
    pub far: f32,
    pub density: f32,
}

#[derive(Clone, Copy, Debug)]
pub struct FogModifierOptions {
    pub color: u32,
    pub mode: Option<FogModifierMode>,
    pub near: Option<f32>,
    pub far: Option<f32>,
    pub density: Option<f32>,
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): callers assign authored modifier fields after construction
pub fn create_fog_modifier() -> FogModifier {
    let mut out: FogModifier = allocate_entity();
    initialize_fog_modifier(&mut out);
    return out;
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): initialization restores canonical defaults before authored assignment
pub fn initialize_fog_modifier(out: &mut FogModifier) {
    initialize_modifier(
        out,
        FOG_MODIFIER_KIND.to_string(),
        MODIFIER_SLOT_EFFECT.to_string(),
    );
    out.color = 0;
    out.mode = FogModifierMode::Linear;
    out.near = 0.0;
    out.far = 1.0;
    out.density = 1.0;
    return;
}

impl Default for FogModifier {
    fn default() -> Self {
        return Self {
            fields: ModifierFields::default(),
            color: 0,
            mode: FogModifierMode::Linear,
            near: 0.0,
            far: 1.0,
            density: 1.0,
        };
    }
}

crate::impl_modifier!(FogModifier, |value: &FogModifier| {
    return match value.mode {
        FogModifierMode::Exponential => "e".to_string(),
        FogModifierMode::Exponential2 => "x".to_string(),
        FogModifierMode::Linear => "l".to_string(),
    };
});
