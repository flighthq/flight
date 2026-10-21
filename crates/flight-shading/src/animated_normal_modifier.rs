use flight_entity::{Ref, allocate_entity};
use flight_geometry::{Vector2, create_vector2};
use flight_texture::Texture;

use crate::contract::{MODIFIER_SLOT_NORMAL, ModifierFields, initialize_modifier};

pub const ANIMATED_NORMAL_MODIFIER_KIND: &str = "AnimatedNormalModifier";

#[derive(Clone, Debug)]
pub struct AnimatedNormalModifier {
    fields: ModifierFields,
    pub map: Option<Ref<Texture>>,
    pub scroll: Vector2,
    pub strength: f32,
    pub secondary_map: Option<Ref<Texture>>,
    pub secondary_scroll: Option<Vector2>,
}

#[derive(Clone, Debug)]
pub struct AnimatedNormalModifierOptions {
    pub map: Option<Ref<Texture>>,
    pub scroll: Vector2,
    pub strength: Option<f32>,
    pub secondary_map: Option<Ref<Texture>>,
    pub secondary_scroll: Option<Vector2>,
}

pub fn create_animated_normal_modifier(
    options: &AnimatedNormalModifierOptions,
) -> AnimatedNormalModifier {
    let mut out: AnimatedNormalModifier = allocate_entity();
    initialize_animated_normal_modifier(&mut out, options);
    return out;
}

pub fn initialize_animated_normal_modifier(
    out: &mut AnimatedNormalModifier,
    options: &AnimatedNormalModifierOptions,
) {
    initialize_modifier(
        out,
        ANIMATED_NORMAL_MODIFIER_KIND.to_string(),
        MODIFIER_SLOT_NORMAL.to_string(),
    );
    out.map = options.map.clone();
    out.scroll = options.scroll.clone();
    out.strength = options.strength.unwrap_or(1.0);
    out.secondary_map = options.secondary_map.clone();
    out.secondary_scroll = options.secondary_scroll.clone();
    return;
}

impl Default for AnimatedNormalModifier {
    fn default() -> Self {
        return Self {
            fields: ModifierFields::default(),
            map: None,
            scroll: create_vector2(0.0, 0.0),
            strength: 1.0,
            secondary_map: None,
            secondary_scroll: None,
        };
    }
}

crate::impl_modifier!(AnimatedNormalModifier, |value: &AnimatedNormalModifier| {
    if value.map.is_none() {
        return "0".to_string();
    }
    return if value.secondary_map.is_some() {
        "2".to_string()
    } else {
        "1".to_string()
    };
});
