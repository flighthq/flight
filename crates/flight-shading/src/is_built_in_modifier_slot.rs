use crate::contract::{
    MODIFIER_SLOT_DIFFUSE, MODIFIER_SLOT_EFFECT, MODIFIER_SLOT_EMISSIVE, MODIFIER_SLOT_NORMAL,
    MODIFIER_SLOT_SPECULAR, MODIFIER_SLOT_VERTEX,
};

pub fn is_built_in_modifier_slot(value: &str) -> bool {
    return matches!(
        value,
        MODIFIER_SLOT_DIFFUSE
            | MODIFIER_SLOT_EFFECT
            | MODIFIER_SLOT_EMISSIVE
            | MODIFIER_SLOT_NORMAL
            | MODIFIER_SLOT_SPECULAR
            | MODIFIER_SLOT_VERTEX
    );
}
