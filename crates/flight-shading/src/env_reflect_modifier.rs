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

pub fn create_env_reflect_modifier(
    options: Option<&EnvReflectModifierOptions>,
) -> EnvReflectModifier {
    let mut out: EnvReflectModifier = allocate_entity();
    initialize_env_reflect_modifier(&mut out, options);
    return out;
}

pub fn initialize_env_reflect_modifier(
    out: &mut EnvReflectModifier,
    options: Option<&EnvReflectModifierOptions>,
) {
    initialize_modifier(
        out,
        ENV_REFLECT_MODIFIER_KIND.to_string(),
        MODIFIER_SLOT_EFFECT.to_string(),
    );
    out.tint = options.and_then(|value| value.tint).unwrap_or(0xffff_ffff);
    out.intensity = options.and_then(|value| value.intensity).unwrap_or(1.0);
    out.fresnel_bias = options.and_then(|value| value.fresnel_bias).unwrap_or(0.04);
    out.roughness = options.and_then(|value| value.roughness).unwrap_or(0.0);
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
