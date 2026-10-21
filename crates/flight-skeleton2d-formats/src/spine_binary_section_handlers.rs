use std::sync::Arc;

use crate::spine_binary_animations_handler::spine_binary_animations_section_handler;
use crate::spine_binary_bones_handler::spine_binary_bones_section_handler;
use crate::spine_binary_registry::register_spine_binary_section_handler;
use crate::spine_binary_skins_handler::spine_binary_skins_section_handler;
use crate::spine_binary_slots_handler::spine_binary_slots_section_handler;
use crate::spine_binary_stub_handlers::*;
use crate::types::*;

pub const SPINE_BINARY_ALL_SECTION_HANDLERS: [for<'a> fn(&mut SpineBinarySectionContext<'a>); 8] = [
    spine_binary_animations_section_handler,
    spine_binary_bones_section_handler,
    spine_binary_events_section_handler,
    spine_binary_ik_constraints_section_handler,
    spine_binary_path_constraints_section_handler,
    spine_binary_skins_section_handler,
    spine_binary_slots_section_handler,
    spine_binary_transform_constraints_section_handler,
];

pub fn register_spine_binary_section_handlers(registry: &mut SpineBinaryRegistry) {
    for (kind, handler) in [
        (
            SPINE_SECTION_KIND_ANIMATIONS,
            SPINE_BINARY_ALL_SECTION_HANDLERS[0],
        ),
        (
            SPINE_SECTION_KIND_BONES,
            SPINE_BINARY_ALL_SECTION_HANDLERS[1],
        ),
        (
            SPINE_SECTION_KIND_EVENTS,
            SPINE_BINARY_ALL_SECTION_HANDLERS[2],
        ),
        (
            SPINE_SECTION_KIND_IK_CONSTRAINTS,
            SPINE_BINARY_ALL_SECTION_HANDLERS[3],
        ),
        (
            SPINE_SECTION_KIND_PATH_CONSTRAINTS,
            SPINE_BINARY_ALL_SECTION_HANDLERS[4],
        ),
        (
            SPINE_SECTION_KIND_SKINS,
            SPINE_BINARY_ALL_SECTION_HANDLERS[5],
        ),
        (
            SPINE_SECTION_KIND_SLOTS,
            SPINE_BINARY_ALL_SECTION_HANDLERS[6],
        ),
        (
            SPINE_SECTION_KIND_TRANSFORM_CONSTRAINTS,
            SPINE_BINARY_ALL_SECTION_HANDLERS[7],
        ),
    ] {
        register_spine_binary_section_handler(registry, kind, Arc::new(handler));
    }
}
