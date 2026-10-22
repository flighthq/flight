use flight_entity::allocate_entity;

use crate::contract::{MODIFIER_SLOT_EFFECT, ModifierFields, initialize_modifier};

pub const ENV_REFLECT_MODIFIER_KIND: &str = "EnvReflectModifier";

#[derive(Clone, Debug)]
pub struct EnvReflectModifier {
    fields: ModifierFields,
    pub tint: u32,
    pub intensity: f32,
    pub fresnel_bias: f32,
    pub roughness: f32,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct EnvReflectModifierOptions {
    pub tint: Option<u32>,
    pub intensity: Option<f32>,
    pub fresnel_bias: Option<f32>,
    pub roughness: Option<f32>,
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): callers assign authored modifier fields after construction
pub fn create_env_reflect_modifier() -> EnvReflectModifier {
    let mut out: EnvReflectModifier = allocate_entity();
    initialize_env_reflect_modifier(&mut out);
    return out;
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): initialization restores canonical defaults before authored assignment
pub fn initialize_env_reflect_modifier(out: &mut EnvReflectModifier) {
    initialize_modifier(
        out,
        ENV_REFLECT_MODIFIER_KIND.to_string(),
        MODIFIER_SLOT_EFFECT.to_string(),
    );
    out.tint = 0xffff_ffff;
    out.intensity = 1.0;
    out.fresnel_bias = 0.04;
    out.roughness = 0.0;
    return;
}

impl Default for EnvReflectModifier {
    fn default() -> Self {
        return Self {
            fields: ModifierFields::default(),
            tint: 0xffff_ffff,
            intensity: 1.0,
            fresnel_bias: 0.04,
            roughness: 0.0,
        };
    }
}

crate::impl_modifier!(EnvReflectModifier);
