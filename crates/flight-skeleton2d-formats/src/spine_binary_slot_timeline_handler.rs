use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_animation::contract::{
    AnimationInterpolation, create_animation_channel, create_animation_track,
};
use flight_skeleton2d::contract::{
    Attachment2DRef, AttachmentSkin2D, SKELETON_2D_ANIMATION_TARGET_KIND_SLOT,
    SKELETON_2D_SLOT_ANIMATION_PATH_ATTACHMENT, SKELETON_2D_SLOT_ANIMATION_PATH_COLOR,
    create_skeleton_2d_animation_target_handle, create_skeleton_2d_slot_animation_target,
};

use crate::spine_binary_parse_helpers::*;
use crate::spine_binary_reader::*;
use crate::types::{ByteReader, SPINE_TIMELINE_KIND_SLOT, SpineBinaryTimelineContext};

fn add_attachment_channel(
    reader: &mut ByteReader<'_>,
    channels: &mut Vec<flight_animation::AnimationChannel>,
    strings: &[Option<String>],
    setup: Option<&AttachmentSkin2D>,
    slot_index: i32,
    frame_count: usize,
) {
    let mut attachments: Vec<Option<Attachment2DRef>> = Vec::new();
    let mut by_name: HashMap<String, i32> = HashMap::new();
    let mut times = Vec::new();
    let mut values = Vec::new();
    for _ in 0..frame_count {
        if is_spine_binary_reader_overrun(reader) {
            break;
        }
        times.push(read_spine_binary_float(reader));
        let Some(name) = read_spine_binary_string_reference(reader, strings) else {
            values.push(SPINE_BINARY_NO_ATTACHMENT_INDEX as f32);
            continue;
        };
        let index = *by_name.entry(name.clone()).or_insert_with(|| {
            let found = setup.and_then(|skin| {
                skin.attachments
                    .iter()
                    .find(|entry| entry.slot_index == slot_index && entry.name == name)
            });
            let Some(found) = found else {
                return SPINE_BINARY_NO_ATTACHMENT_INDEX;
            };
            attachments.push(Some(found.attachment.clone()));
            return attachments.len() as i32 - 1;
        });
        values.push(index as f32);
    }
    if times.is_empty() {
        return;
    }
    let track = {
        let mut track = create_animation_track();
        track.components = 1;
        track.interpolation = AnimationInterpolation::Step;
        track.times = times;
        track.values = values;
        track
    };
    push_slot_channel(
        channels,
        track,
        slot_index,
        SKELETON_2D_SLOT_ANIMATION_PATH_ATTACHMENT,
        Some(Arc::new(attachments)),
    );
}

fn consume_slot_timelines(context: &mut SpineBinaryTimelineContext<'_, '_>, retain: bool) {
    let setup = context
        .section
        .skins
        .iter()
        .find(|skin| skin.name == SPINE_BINARY_DEFAULT_SKIN_NAME)
        .cloned();
    let strings = context.section.strings.clone();
    let slots = read_spine_binary_varint(&mut context.section.reader) as usize;
    for _ in 0..slots {
        if is_spine_binary_reader_overrun(&context.section.reader) {
            break;
        }
        let slot_index = read_spine_binary_varint(&mut context.section.reader) as i32;
        let timeline_count = read_spine_binary_varint(&mut context.section.reader) as usize;
        for _ in 0..timeline_count {
            if !retain {
                tally(
                    &mut context.unregistered_timeline_counts,
                    SPINE_TIMELINE_KIND_SLOT,
                );
            }
            let kind = read_spine_binary_byte(&mut context.section.reader);
            let frame_count = read_spine_binary_varint(&mut context.section.reader) as usize;
            if kind == SPINE_BINARY_SLOT_ATTACHMENT {
                if retain {
                    add_attachment_channel(
                        &mut context.section.reader,
                        &mut context.channels,
                        &strings,
                        setup.as_ref(),
                        slot_index,
                        frame_count,
                    );
                } else {
                    for _ in 0..frame_count {
                        skip_spine_binary_bytes(&mut context.section.reader, 4);
                        read_spine_binary_varint(&mut context.section.reader);
                    }
                }
                continue;
            }
            read_spine_binary_varint(&mut context.section.reader);
            let channels = SLOT_COLOR_CHANNELS.get(kind as usize).copied().unwrap_or(1);
            if !retain || kind != SPINE_BINARY_SLOT_RGBA {
                if retain {
                    tally(&mut context.unmodeled_timeline_counts, "slot-color");
                }
                skip_spine_binary_curve_frames(
                    &mut context.section.reader,
                    frame_count,
                    channels,
                    channels,
                );
                continue;
            }
            let (times, values) =
                read_color_timeline(&mut context.section.reader, frame_count, channels);
            let track = {
                let mut track = create_animation_track();
                track.components = channels;
                track.interpolation = AnimationInterpolation::Linear;
                track.times = times;
                track.values = values;
                track
            };
            push_slot_channel(
                &mut context.channels,
                track,
                slot_index,
                SKELETON_2D_SLOT_ANIMATION_PATH_COLOR,
                None,
            );
        }
    }
}

fn push_slot_channel(
    channels: &mut Vec<flight_animation::AnimationChannel>,
    track: flight_animation::AnimationTrack,
    slot_index: i32,
    path: &str,
    attachments: Option<Arc<Vec<Option<Attachment2DRef>>>>,
) {
    let track = Arc::new(RwLock::new(track));
    let target = create_skeleton_2d_slot_animation_target(slot_index, path, attachments);
    let handle = create_skeleton_2d_animation_target_handle(
        SKELETON_2D_ANIMATION_TARGET_KIND_SLOT,
        Some(Arc::new(target)),
    );
    channels.push(create_animation_channel(&track, Some(Arc::new(handle))));
}

fn read_color_timeline(
    reader: &mut ByteReader<'_>,
    frame_count: usize,
    channel_count: usize,
) -> (Vec<f32>, Vec<f32>) {
    if frame_count == 0 {
        return (Vec::new(), Vec::new());
    }
    let mut times = vec![read_spine_binary_float(reader)];
    let mut values = (0..channel_count)
        .map(|_| read_spine_binary_byte(reader) as f32 / 255.0)
        .collect::<Vec<_>>();
    for _ in 0..frame_count.saturating_sub(1) {
        if is_spine_binary_reader_overrun(reader) {
            break;
        }
        times.push(read_spine_binary_float(reader));
        values.extend((0..channel_count).map(|_| read_spine_binary_byte(reader) as f32 / 255.0));
        if read_spine_binary_byte(reader) == SPINE_BINARY_CURVE_BEZIER {
            for _ in 0..channel_count * 4 {
                read_spine_binary_float(reader);
            }
        }
    }
    return (times, values);
}

pub fn skip_spine_binary_slot_timelines(context: &mut SpineBinaryTimelineContext<'_, '_>) {
    consume_slot_timelines(context, false);
}

pub fn spine_binary_slot_timeline_handler(context: &mut SpineBinaryTimelineContext<'_, '_>) {
    consume_slot_timelines(context, true);
}

const SLOT_COLOR_CHANNELS: [usize; 6] = [0, 4, 3, 7, 6, 1];
