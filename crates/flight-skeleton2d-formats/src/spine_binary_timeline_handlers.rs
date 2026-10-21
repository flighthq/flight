use std::sync::Arc;

use crate::spine_binary_bone_timeline_handler::spine_binary_bone_timeline_handler;
use crate::spine_binary_draw_order_timeline_handler::spine_binary_draw_order_timeline_handler;
use crate::spine_binary_registry::register_spine_binary_timeline_handler;
use crate::spine_binary_slot_timeline_handler::spine_binary_slot_timeline_handler;
use crate::spine_binary_stub_timeline_handlers::*;
use crate::types::*;

pub const SPINE_BINARY_ALL_TIMELINE_HANDLERS: [for<'a, 'b> fn(
    &mut SpineBinaryTimelineContext<'a, 'b>,
); 8] = [
    spine_binary_bone_timeline_handler,
    spine_binary_deform_timeline_handler,
    spine_binary_draw_order_timeline_handler,
    spine_binary_event_timeline_handler,
    spine_binary_ik_timeline_handler,
    spine_binary_path_timeline_handler,
    spine_binary_slot_timeline_handler,
    spine_binary_transform_timeline_handler,
];

pub fn register_spine_binary_timeline_handlers(registry: &mut SpineBinaryRegistry) {
    for (kind, handler) in [
        (
            SPINE_TIMELINE_KIND_BONE,
            SPINE_BINARY_ALL_TIMELINE_HANDLERS[0],
        ),
        (
            SPINE_TIMELINE_KIND_DEFORM,
            SPINE_BINARY_ALL_TIMELINE_HANDLERS[1],
        ),
        (
            SPINE_TIMELINE_KIND_DRAW_ORDER,
            SPINE_BINARY_ALL_TIMELINE_HANDLERS[2],
        ),
        (
            SPINE_TIMELINE_KIND_EVENT,
            SPINE_BINARY_ALL_TIMELINE_HANDLERS[3],
        ),
        (
            SPINE_TIMELINE_KIND_IK,
            SPINE_BINARY_ALL_TIMELINE_HANDLERS[4],
        ),
        (
            SPINE_TIMELINE_KIND_PATH,
            SPINE_BINARY_ALL_TIMELINE_HANDLERS[5],
        ),
        (
            SPINE_TIMELINE_KIND_SLOT,
            SPINE_BINARY_ALL_TIMELINE_HANDLERS[6],
        ),
        (
            SPINE_TIMELINE_KIND_TRANSFORM,
            SPINE_BINARY_ALL_TIMELINE_HANDLERS[7],
        ),
    ] {
        register_spine_binary_timeline_handler(registry, kind, Arc::new(handler));
    }
}
