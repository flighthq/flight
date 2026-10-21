use std::sync::Arc;

use crate::dragon_bones_animations_handler::dragon_bones_animations_section_handler;
use crate::dragon_bones_bones_handler::dragon_bones_bones_section_handler;
use crate::dragon_bones_registry::register_dragon_bones_section_handler;
use crate::dragon_bones_skins_handler::dragon_bones_skins_section_handler;
use crate::dragon_bones_slots_handler::dragon_bones_slots_section_handler;
use crate::dragon_bones_stub_handlers::dragon_bones_ik_constraints_section_handler;
use crate::types::*;

pub const DRAGON_BONES_ALL_SECTION_HANDLERS: [for<'a> fn(&mut DragonBonesSectionContext<'a>); 5] = [
    dragon_bones_bones_section_handler,
    dragon_bones_skins_section_handler,
    dragon_bones_slots_section_handler,
    dragon_bones_animations_section_handler,
    dragon_bones_ik_constraints_section_handler,
];

pub fn register_dragon_bones_section_handlers(registry: &mut DragonBonesRegistry) {
    for (kind, handler) in [
        (
            DRAGON_BONES_SECTION_KIND_BONES,
            DRAGON_BONES_ALL_SECTION_HANDLERS[0],
        ),
        (
            DRAGON_BONES_SECTION_KIND_SKINS,
            DRAGON_BONES_ALL_SECTION_HANDLERS[1],
        ),
        (
            DRAGON_BONES_SECTION_KIND_SLOTS,
            DRAGON_BONES_ALL_SECTION_HANDLERS[2],
        ),
        (
            DRAGON_BONES_SECTION_KIND_ANIMATIONS,
            DRAGON_BONES_ALL_SECTION_HANDLERS[3],
        ),
        (
            DRAGON_BONES_SECTION_KIND_IK_CONSTRAINTS,
            DRAGON_BONES_ALL_SECTION_HANDLERS[4],
        ),
    ] {
        register_dragon_bones_section_handler(registry, kind, Arc::new(handler));
    }
}
