use std::sync::Arc;

use crate::spine_json_bone_timeline_handler::spine_json_bone_timeline_handler;
use crate::spine_json_draw_order_timeline_handler::spine_json_draw_order_timeline_handler;
use crate::spine_json_registry::register_spine_json_timeline_handler;
use crate::spine_json_slot_timeline_handler::spine_json_slot_timeline_handler;
use crate::spine_json_stub_handlers::{
    spine_json_deform_timeline_handler, spine_json_event_timeline_handler,
    spine_json_ik_timeline_handler, spine_json_path_timeline_handler,
    spine_json_transform_timeline_handler,
};
use crate::types::*;

pub const SPINE_JSON_ALL_TIMELINE_HANDLERS: [for<'a, 'b> fn(
    &mut SpineJsonTimelineContext<'a, 'b>,
    &str,
    &JsonRecord,
); 8] = [
    spine_json_bone_timeline_handler,
    spine_json_slot_timeline_handler,
    spine_json_deform_timeline_handler,
    spine_json_draw_order_timeline_handler,
    spine_json_event_timeline_handler,
    spine_json_ik_timeline_handler,
    spine_json_path_timeline_handler,
    spine_json_transform_timeline_handler,
];

pub fn register_spine_json_timeline_handlers(registry: &mut SpineJsonRegistry) {
    for (kind, handler) in [
        (
            SPINE_TIMELINE_KIND_BONE,
            SPINE_JSON_ALL_TIMELINE_HANDLERS[0],
        ),
        (
            SPINE_TIMELINE_KIND_SLOT,
            SPINE_JSON_ALL_TIMELINE_HANDLERS[1],
        ),
        (
            SPINE_TIMELINE_KIND_DEFORM,
            SPINE_JSON_ALL_TIMELINE_HANDLERS[2],
        ),
        (
            SPINE_TIMELINE_KIND_DRAW_ORDER,
            SPINE_JSON_ALL_TIMELINE_HANDLERS[3],
        ),
        (
            SPINE_TIMELINE_KIND_EVENT,
            SPINE_JSON_ALL_TIMELINE_HANDLERS[4],
        ),
        (SPINE_TIMELINE_KIND_IK, SPINE_JSON_ALL_TIMELINE_HANDLERS[5]),
        (
            SPINE_TIMELINE_KIND_PATH,
            SPINE_JSON_ALL_TIMELINE_HANDLERS[6],
        ),
        (
            SPINE_TIMELINE_KIND_TRANSFORM,
            SPINE_JSON_ALL_TIMELINE_HANDLERS[7],
        ),
    ] {
        register_spine_json_timeline_handler(registry, kind, Arc::new(handler));
    }
}
