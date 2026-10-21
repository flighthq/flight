use std::sync::Arc;

use crate::dragon_bones_bone_timeline_handler::dragon_bones_bone_timeline_handler;
use crate::dragon_bones_registry::register_dragon_bones_timeline_handler;
use crate::dragon_bones_slot_timeline_handler::dragon_bones_slot_timeline_handler;
use crate::dragon_bones_stub_handlers::{
    dragon_bones_deform_timeline_handler, dragon_bones_ik_timeline_handler,
    dragon_bones_z_order_timeline_handler,
};
use crate::types::*;

pub const DRAGON_BONES_ALL_TIMELINE_HANDLERS: [for<'a, 'b> fn(
    &mut DragonBonesTimelineContext<'a, 'b>,
    &str,
    &JsonRecord,
); 5] = [
    dragon_bones_bone_timeline_handler,
    dragon_bones_slot_timeline_handler,
    dragon_bones_deform_timeline_handler,
    dragon_bones_ik_timeline_handler,
    dragon_bones_z_order_timeline_handler,
];

pub fn register_dragon_bones_timeline_handlers(registry: &mut DragonBonesRegistry) {
    for (kind, handler) in [
        (
            DRAGON_BONES_TIMELINE_KIND_BONE,
            DRAGON_BONES_ALL_TIMELINE_HANDLERS[0],
        ),
        (
            DRAGON_BONES_TIMELINE_KIND_SLOT,
            DRAGON_BONES_ALL_TIMELINE_HANDLERS[1],
        ),
        (
            DRAGON_BONES_TIMELINE_KIND_DEFORM,
            DRAGON_BONES_ALL_TIMELINE_HANDLERS[2],
        ),
        (
            DRAGON_BONES_TIMELINE_KIND_IK,
            DRAGON_BONES_ALL_TIMELINE_HANDLERS[3],
        ),
        (
            DRAGON_BONES_TIMELINE_KIND_Z_ORDER,
            DRAGON_BONES_ALL_TIMELINE_HANDLERS[4],
        ),
    ] {
        register_dragon_bones_timeline_handler(registry, kind, Arc::new(handler));
    }
}
