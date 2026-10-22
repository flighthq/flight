use flight_entity::{Ref, allocate_entity};
use flight_texture::Texture;

use crate::contract::{
    EmissiveModifierFacing, MODIFIER_SLOT_EMISSIVE, ModifierFields, initialize_modifier,
};

pub const EMISSIVE_MODIFIER_KIND: &str = "EmissiveModifier";

#[derive(Clone, Debug)]
pub struct EmissiveModifier {
    fields: ModifierFields,
    pub color: u32,
    pub strength: f32,
    pub mask: Option<Ref<Texture>>,
    pub facing: EmissiveModifierFacing,
    pub facing_softness: f32,
}

#[derive(Clone, Debug)]
pub struct EmissiveModifierOptions {
    pub color: u32,
    pub strength: Option<f32>,
    pub mask: Option<Ref<Texture>>,
    pub facing: Option<EmissiveModifierFacing>,
    pub facing_softness: Option<f32>,
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): callers assign authored modifier fields after construction
pub fn create_emissive_modifier() -> EmissiveModifier {
    let mut out: EmissiveModifier = allocate_entity();
    initialize_emissive_modifier(&mut out);
    return out;
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): initialization restores canonical defaults before authored assignment
pub fn initialize_emissive_modifier(out: &mut EmissiveModifier) {
    initialize_modifier(
        out,
        EMISSIVE_MODIFIER_KIND.to_string(),
        MODIFIER_SLOT_EMISSIVE.to_string(),
    );
    out.color = 0;
    out.strength = 1.0;
    out.mask = None;
    out.facing = EmissiveModifierFacing::Ignore;
    out.facing_softness = 0.0;
    return;
}

impl Default for EmissiveModifier {
    fn default() -> Self {
        return Self {
            fields: ModifierFields::default(),
            color: 0,
            strength: 1.0,
            mask: None,
            facing: EmissiveModifierFacing::Ignore,
            facing_softness: 0.0,
        };
    }
}

crate::impl_modifier!(EmissiveModifier, |value: &EmissiveModifier| {
    let mut signature = String::new();
    if value.mask.is_some() {
        signature.push('m');
    }
    if value.facing != EmissiveModifierFacing::Ignore {
        signature.push('g');
    }
    return signature;
});
