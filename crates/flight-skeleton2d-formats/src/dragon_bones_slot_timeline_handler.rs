use std::sync::{Arc, RwLock};

use flight_animation::contract::{
    AnimationChannel, AnimationInterpolation, create_animation_channel, create_animation_track,
};
use flight_skeleton2d::contract::{
    Attachment2DRef, SKELETON_2D_ANIMATION_TARGET_KIND_SLOT,
    SKELETON_2D_SLOT_ANIMATION_PATH_ATTACHMENT, SKELETON_2D_SLOT_ANIMATION_PATH_COLOR,
    create_skeleton_2d_animation_target_handle, create_skeleton_2d_slot_animation_target,
};
use serde_json::Value;

use crate::dragon_bones_parse_helpers::{
    build_dragon_bones_segment_easings, dragon_bones_frame_times, dragon_bones_frames,
    dragon_bones_interpolation, number_or,
};
use crate::types::{DragonBonesTimelineContext, JsonRecord};

pub fn dragon_bones_slot_timeline_handler(
    context: &mut DragonBonesTimelineContext<'_, '_>,
    _anim_name: &str,
    anim_entry: &JsonRecord,
) {
    let Some(timelines) = anim_entry.get("slot").and_then(Value::as_array) else {
        return;
    };
    for timeline in timelines.iter().filter_map(Value::as_object) {
        let name = timeline.get("name").and_then(Value::as_str);
        let slot_index = name
            .and_then(|name| context.section.slot_order.get(name))
            .map(|index| *index as i32)
            .unwrap_or(-1);
        if slot_index < 0 {
            *context
                .unmodeled_timeline_counts
                .entry("slot".to_string())
                .or_default() += 1;
            continue;
        }
        let display_frames = dragon_bones_frames(
            timeline
                .get("displayFrame")
                .or_else(|| timeline.get("display")),
            None,
        );
        if !display_frames.is_empty() {
            let displays = name
                .and_then(|name| context.section.display_table.get(name))
                .cloned()
                .unwrap_or_default();
            let values = display_frames
                .iter()
                .map(|frame| {
                    let index = number_or(
                        frame.get("value").or_else(|| frame.get("displayIndex")),
                        0.0,
                    ) as i32;
                    if index >= 0 && displays.get(index as usize).is_some_and(Option::is_some) {
                        index as f32
                    } else {
                        -1.0
                    }
                })
                .collect();
            let mut times = Vec::new();
            dragon_bones_frame_times(&mut times, &display_frames, context.section.frame_rate);
            push_slot_channel(
                &mut context.channels,
                times,
                values,
                1,
                AnimationInterpolation::Step,
                slot_index,
                SKELETON_2D_SLOT_ANIMATION_PATH_ATTACHMENT,
                Some(displays),
                None,
            );
        }
        let color_frames = dragon_bones_frames(
            timeline.get("colorFrame").or_else(|| timeline.get("color")),
            None,
        );
        if !color_frames.is_empty() {
            let values = color_frames
                .iter()
                .flat_map(|frame| {
                    let color = frame
                        .get("value")
                        .or_else(|| frame.get("color"))
                        .and_then(Value::as_object);
                    ["rM", "gM", "bM", "aM"].map(|key| {
                        (number_or(color.and_then(|color| color.get(key)), 100.0) / 100.0)
                            .clamp(0.0, 1.0)
                    })
                })
                .collect();
            let interpolation = dragon_bones_interpolation(&color_frames, None);
            let segment_easings = build_dragon_bones_segment_easings(&color_frames);
            let mut times = Vec::new();
            dragon_bones_frame_times(&mut times, &color_frames, context.section.frame_rate);
            push_slot_channel(
                &mut context.channels,
                times,
                values,
                4,
                interpolation,
                slot_index,
                SKELETON_2D_SLOT_ANIMATION_PATH_COLOR,
                None,
                segment_easings,
            );
        }
    }
}

fn push_slot_channel(
    channels: &mut Vec<AnimationChannel>,
    times: Vec<f32>,
    values: Vec<f32>,
    components: usize,
    interpolation: AnimationInterpolation,
    slot_index: i32,
    path: &str,
    attachments: Option<Vec<Option<Attachment2DRef>>>,
    segment_easings: Option<Vec<Option<flight_animation::EasingFn>>>,
) {
    let track = Arc::new(RwLock::new({
        let mut track = create_animation_track();
        track.times = times;
        track.values = values;
        track.components = components;
        track.interpolation = interpolation;
        track.segment_easings = segment_easings;
        track
    }));
    let mut target = create_skeleton_2d_slot_animation_target();
    target.slot_index = slot_index;
    target.path = String::from(path);
    target.attachments = attachments.map(Arc::new);
    let handle = create_skeleton_2d_animation_target_handle(
        SKELETON_2D_ANIMATION_TARGET_KIND_SLOT,
        Some(Arc::new(target)),
    );
    channels.push(create_animation_channel(&track, Some(Arc::new(handle))));
}
