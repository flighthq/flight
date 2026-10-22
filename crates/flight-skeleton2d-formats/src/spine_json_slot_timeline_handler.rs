use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_animation::contract::{
    AnimationChannel, AnimationInterpolation, create_animation_channel, create_animation_track,
};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_skeleton2d::contract::{
    Attachment2DRef, AttachmentSkin2D, SKELETON_2D_ANIMATION_TARGET_KIND_SLOT,
    SKELETON_2D_SLOT_ANIMATION_PATH_ATTACHMENT, SKELETON_2D_SLOT_ANIMATION_PATH_COLOR,
    create_skeleton_2d_animation_target_handle, create_skeleton_2d_slot_animation_target,
};
use serde_json::Value;

use crate::spine_parse_helpers::{
    SPINE_DEFAULT_SKIN_NAME, SPINE_NO_ATTACHMENT_INDEX, build_spine_segment_easings,
    index_of_spine_slot, number_or, parse_spine_color,
};
use crate::types::{JsonRecord, SpineJsonTimelineContext, sorted_count_entries};

fn add_spine_slot_attachment_channel(
    channels: &mut Vec<AnimationChannel>,
    raw_keys: &[Value],
    slot_index: i32,
    skins: &[AttachmentSkin2D],
) {
    let setup = skins
        .iter()
        .find(|skin| skin.name == SPINE_DEFAULT_SKIN_NAME)
        .or_else(|| skins.first());
    let mut attachments: Vec<Option<Attachment2DRef>> = Vec::new();
    let mut index_by_name: HashMap<String, i32> = HashMap::new();
    let mut times = Vec::new();
    let mut values = Vec::new();
    for key in raw_keys.iter().filter_map(Value::as_object) {
        times.push(number_or(key.get("time"), 0.0));
        let Some(name) = key.get("name").and_then(Value::as_str) else {
            values.push(SPINE_NO_ATTACHMENT_INDEX as f32);
            continue;
        };
        let index = *index_by_name.entry(name.to_string()).or_insert_with(|| {
            let found = setup.and_then(|skin| {
                skin.attachments
                    .iter()
                    .find(|entry| entry.slot_index == slot_index && entry.name == name)
            });
            let Some(found) = found else {
                return SPINE_NO_ATTACHMENT_INDEX;
            };
            attachments.push(Some(found.attachment.clone()));
            return attachments.len() as i32 - 1;
        });
        values.push(index as f32);
    }
    if times.is_empty() {
        return;
    }
    push_slot_channel(
        channels,
        {
            let mut track = create_animation_track();
            track.components = 1;
            track.interpolation = AnimationInterpolation::Step;
            track.times = times;
            track.values = values;
            track
        },
        slot_index,
        SKELETON_2D_SLOT_ANIMATION_PATH_ATTACHMENT,
        Some(Arc::new(attachments)),
    );
}

fn add_spine_slot_color_channel(
    channels: &mut Vec<AnimationChannel>,
    raw_keys: &[Value],
    slot_index: i32,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) {
    let mut times = Vec::new();
    let mut values = Vec::new();
    let mut keys = Vec::new();
    let mut all_stepped = true;
    for key in raw_keys.iter().filter_map(Value::as_object) {
        keys.push(JsonRecord::from(key.clone()));
        times.push(number_or(key.get("time"), 0.0));
        let packed = parse_spine_color(key.get("color"));
        values.extend([
            ((packed >> 24) & 0xff) as f32 / 255.0,
            ((packed >> 16) & 0xff) as f32 / 255.0,
            ((packed >> 8) & 0xff) as f32 / 255.0,
            (packed & 0xff) as f32 / 255.0,
        ]);
        if key.get("curve").and_then(Value::as_str) != Some("stepped") {
            all_stepped = false;
        }
    }
    if times.is_empty() {
        return;
    }
    let segment_easings = build_spine_segment_easings(&keys, &times, &values, 4, diagnostics);
    push_slot_channel(
        channels,
        {
            let mut track = create_animation_track();
            track.components = 4;
            track.interpolation = if all_stepped {
                AnimationInterpolation::Step
            } else {
                AnimationInterpolation::Linear
            };
            track.segment_easings = segment_easings;
            track.times = times;
            track.values = values;
            track
        },
        slot_index,
        SKELETON_2D_SLOT_ANIMATION_PATH_COLOR,
        None,
    );
}

fn push_slot_channel(
    channels: &mut Vec<AnimationChannel>,
    track: flight_animation::AnimationTrack,
    slot_index: i32,
    path: &str,
    attachments: Option<Arc<Vec<Option<Attachment2DRef>>>>,
) {
    let track = Arc::new(RwLock::new(track));
    let mut target = create_skeleton_2d_slot_animation_target();
    target.slot_index = slot_index;
    target.path = String::from(path);
    target.attachments = attachments;
    let handle = create_skeleton_2d_animation_target_handle(
        SKELETON_2D_ANIMATION_TARGET_KIND_SLOT,
        Some(Arc::new(target)),
    );
    channels.push(create_animation_channel(&track, Some(Arc::new(handle))));
}

pub fn spine_json_slot_timeline_handler(
    context: &mut SpineJsonTimelineContext<'_, '_>,
    _anim_name: &str,
    anim_entry: &JsonRecord,
) {
    let Some(slots) = anim_entry.get("slots").and_then(Value::as_object) else {
        return;
    };
    let mut unmodeled: HashMap<String, usize> = HashMap::new();
    for (slot_name, value) in slots {
        let slot_index = index_of_spine_slot(&context.section.slots, slot_name);
        let Some(timelines) = value.as_object() else {
            continue;
        };
        for (kind, keys) in timelines {
            if kind != "rgba" && kind != "attachment" {
                *unmodeled.entry(kind.clone()).or_default() += 1;
                continue;
            }
            let Some(keys) = keys
                .as_array()
                .filter(|keys| !keys.is_empty() && slot_index >= 0)
            else {
                continue;
            };
            if kind == "attachment" {
                add_spine_slot_attachment_channel(
                    &mut context.channels,
                    keys,
                    slot_index,
                    &context.section.skins,
                );
            } else {
                add_spine_slot_color_channel(
                    &mut context.channels,
                    keys,
                    slot_index,
                    context.section.diagnostics.as_deref_mut(),
                );
            }
        }
    }
    for (kind, count) in sorted_count_entries(&unmodeled) {
        let mut detail = HashMap::new();
        detail.insert(
            "timelines".to_string(),
            ImportDiagnosticDetailValue::Number(count as f32),
        );
        report_import_diagnostic(
            context.section.diagnostics.as_deref_mut(),
            ImportDiagnosticSeverity::Skip,
            &format!("spine.slot-{kind}-timeline-unsupported"),
            "parseSpineSlotTimelines",
            Some(detail),
        );
    }
}
