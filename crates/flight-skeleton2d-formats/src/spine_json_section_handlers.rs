use std::sync::Arc;

use crate::spine_json_animations_handler::spine_json_animations_section_handler;
use crate::spine_json_bones_handler::spine_json_bones_section_handler;
use crate::spine_json_registry::register_spine_json_section_handler;
use crate::spine_json_skins_handler::spine_json_skins_section_handler;
use crate::spine_json_slots_handler::spine_json_slots_section_handler;
use crate::spine_json_stub_handlers::{
    spine_json_events_section_handler, spine_json_ik_constraints_section_handler,
    spine_json_path_constraints_section_handler, spine_json_transform_constraints_section_handler,
};
use crate::types::*;

pub const SPINE_JSON_ALL_SECTION_HANDLERS: [for<'a> fn(&mut SpineJsonSectionContext<'a>); 8] = [
    spine_json_bones_section_handler,
    spine_json_slots_section_handler,
    spine_json_skins_section_handler,
    spine_json_events_section_handler,
    spine_json_ik_constraints_section_handler,
    spine_json_path_constraints_section_handler,
    spine_json_transform_constraints_section_handler,
    spine_json_animations_section_handler,
];

pub fn register_spine_json_section_handlers(registry: &mut SpineJsonRegistry) {
    for (kind, handler) in [
        (SPINE_SECTION_KIND_BONES, SPINE_JSON_ALL_SECTION_HANDLERS[0]),
        (SPINE_SECTION_KIND_SLOTS, SPINE_JSON_ALL_SECTION_HANDLERS[1]),
        (SPINE_SECTION_KIND_SKINS, SPINE_JSON_ALL_SECTION_HANDLERS[2]),
        (
            SPINE_SECTION_KIND_EVENTS,
            SPINE_JSON_ALL_SECTION_HANDLERS[3],
        ),
        (
            SPINE_SECTION_KIND_IK_CONSTRAINTS,
            SPINE_JSON_ALL_SECTION_HANDLERS[4],
        ),
        (
            SPINE_SECTION_KIND_PATH_CONSTRAINTS,
            SPINE_JSON_ALL_SECTION_HANDLERS[5],
        ),
        (
            SPINE_SECTION_KIND_TRANSFORM_CONSTRAINTS,
            SPINE_JSON_ALL_SECTION_HANDLERS[6],
        ),
        (
            SPINE_SECTION_KIND_ANIMATIONS,
            SPINE_JSON_ALL_SECTION_HANDLERS[7],
        ),
    ] {
        register_spine_json_section_handler(registry, kind, Arc::new(handler));
    }
}
