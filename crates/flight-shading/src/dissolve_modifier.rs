use flight_entity::{Ref, allocate_entity};
use flight_texture::Texture;

use crate::contract::{MODIFIER_SLOT_EFFECT, ModifierFields, initialize_modifier};

pub const DISSOLVE_MODIFIER_KIND: &str = "DissolveModifier";

#[derive(Clone, Debug)]
pub struct DissolveModifier {
    fields: ModifierFields,
    pub threshold: f32,
    pub edge_color: u32,
    pub edge_width: f32,
    pub map: Option<Ref<Texture>>,
    pub scale: f32,
}

#[derive(Clone, Debug)]
pub struct DissolveModifierOptions {
    pub threshold: f32,
    pub edge_color: Option<u32>,
    pub edge_width: Option<f32>,
    pub map: Option<Ref<Texture>>,
    pub scale: Option<f32>,
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): callers assign authored modifier fields after construction
pub fn create_dissolve_modifier() -> DissolveModifier {
    let mut out: DissolveModifier = allocate_entity();
    initialize_dissolve_modifier(&mut out);
    return out;
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): initialization restores canonical defaults before authored assignment
pub fn initialize_dissolve_modifier(out: &mut DissolveModifier) {
    initialize_modifier(
        out,
        DISSOLVE_MODIFIER_KIND.to_string(),
        MODIFIER_SLOT_EFFECT.to_string(),
    );
    out.threshold = 0.0;
    out.edge_color = 0xff66_00ff;
    out.edge_width = 0.05;
    out.map = None;
    out.scale = 8.0;
    return;
}

impl Default for DissolveModifier {
    fn default() -> Self {
        return Self {
            fields: ModifierFields::default(),
            threshold: 0.0,
            edge_color: 0xff66_00ff,
            edge_width: 0.05,
            map: None,
            scale: 8.0,
        };
    }
}

crate::impl_modifier!(DissolveModifier, |value: &DissolveModifier| {
    return if value.map.is_some() {
        "m".to_string()
    } else {
        String::new()
    };
});
