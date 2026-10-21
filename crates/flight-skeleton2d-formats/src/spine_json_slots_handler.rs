use std::sync::Arc;

use flight_skeleton2d::contract::Slot2D;
use serde_json::Value;

use crate::spine_parse_helpers::{index_of_bone, parse_spine_color};
use crate::types::{SpineJsonSectionContext, SpineJsonSectionHandler};

pub fn spine_json_slots_section_handler(context: &mut SpineJsonSectionContext<'_>) {
    let Some(raw) = context.doc.get("slots").and_then(Value::as_array) else {
        return;
    };
    for entry in raw {
        let Some(slot) = entry.as_object() else {
            continue;
        };
        let bone_index = slot
            .get("bone")
            .and_then(Value::as_str)
            .map(|name| index_of_bone(&context.bones, name))
            .unwrap_or(-1);
        context.attachment_names.push(
            slot.get("attachment")
                .and_then(Value::as_str)
                .map(str::to_string),
        );
        context.slots.push(Slot2D {
            attachment: None,
            deform: None,
            bone_index,
            color: Some(parse_spine_color(slot.get("color"))),
            name: slot.get("name").and_then(Value::as_str).map(str::to_string),
        });
    }
}

pub fn spine_json_slots_section_reader() -> SpineJsonSectionHandler {
    return Arc::new(spine_json_slots_section_handler);
}
