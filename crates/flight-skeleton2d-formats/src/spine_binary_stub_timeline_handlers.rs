use std::collections::HashMap;

use crate::spine_binary_parse_helpers::{
    SPINE_BINARY_ATTACHMENT_SEQUENCE, SPINE_BINARY_PATH_MIX, skip_spine_binary_curve_frames,
    skip_spine_binary_curve_tag, tally,
};
use crate::spine_binary_reader::*;
use crate::types::*;

fn consume_deform(context: &mut SpineBinaryTimelineContext<'_, '_>, modeled: bool) {
    let skins = read_spine_binary_varint(&mut context.section.reader) as usize;
    for _ in 0..skins {
        read_spine_binary_varint(&mut context.section.reader);
        let slots = read_spine_binary_varint(&mut context.section.reader) as usize;
        for _ in 0..slots {
            read_spine_binary_varint(&mut context.section.reader);
            let attachments = read_spine_binary_varint(&mut context.section.reader) as usize;
            for _ in 0..attachments {
                read_spine_binary_varint(&mut context.section.reader);
                let kind = read_spine_binary_byte(&mut context.section.reader);
                let frames = read_spine_binary_varint(&mut context.section.reader) as usize;
                if kind == SPINE_BINARY_ATTACHMENT_SEQUENCE {
                    tally(
                        counts(context, modeled),
                        if modeled {
                            "attachment-sequence"
                        } else {
                            SPINE_TIMELINE_KIND_DEFORM
                        },
                    );
                    skip_spine_binary_bytes(&mut context.section.reader, frames * 12);
                    continue;
                }
                tally(
                    counts(context, modeled),
                    if modeled {
                        "deform"
                    } else {
                        SPINE_TIMELINE_KIND_DEFORM
                    },
                );
                read_spine_binary_varint(&mut context.section.reader);
                skip_spine_binary_bytes(&mut context.section.reader, 4);
                for frame in 0..frames {
                    let run = read_spine_binary_varint(&mut context.section.reader) as usize;
                    if run != 0 {
                        read_spine_binary_varint(&mut context.section.reader);
                        skip_spine_binary_bytes(&mut context.section.reader, run * 4);
                    }
                    if frame + 1 == frames {
                        break;
                    }
                    skip_spine_binary_bytes(&mut context.section.reader, 4);
                    skip_spine_binary_curve_tag(&mut context.section.reader, 1);
                }
            }
        }
    }
}

fn consume_event(context: &mut SpineBinaryTimelineContext<'_, '_>, modeled: bool) {
    let frames = read_spine_binary_varint(&mut context.section.reader) as usize;
    if frames > 0 {
        tally(
            counts(context, modeled),
            if modeled {
                "event"
            } else {
                SPINE_TIMELINE_KIND_EVENT
            },
        );
    }
    for _ in 0..frames {
        skip_spine_binary_bytes(&mut context.section.reader, 4);
        read_spine_binary_varint(&mut context.section.reader);
        read_spine_binary_varint(&mut context.section.reader);
        skip_spine_binary_bytes(&mut context.section.reader, 4);
        if read_spine_binary_boolean(&mut context.section.reader) {
            read_spine_binary_string(&mut context.section.reader);
        }
    }
}

fn consume_ik(context: &mut SpineBinaryTimelineContext<'_, '_>, modeled: bool) {
    let count = read_spine_binary_varint(&mut context.section.reader) as usize;
    for _ in 0..count {
        tally(
            counts(context, modeled),
            if modeled {
                "ik"
            } else {
                SPINE_TIMELINE_KIND_IK
            },
        );
        read_spine_binary_varint(&mut context.section.reader);
        let frames = read_spine_binary_varint(&mut context.section.reader) as usize;
        read_spine_binary_varint(&mut context.section.reader);
        skip_spine_binary_bytes(&mut context.section.reader, 12);
        for frame in 0..frames {
            skip_spine_binary_bytes(&mut context.section.reader, 3);
            if frame + 1 == frames {
                break;
            }
            skip_spine_binary_bytes(&mut context.section.reader, 12);
            skip_spine_binary_curve_tag(&mut context.section.reader, 2);
        }
    }
}

fn consume_path(context: &mut SpineBinaryTimelineContext<'_, '_>, modeled: bool) {
    let count = read_spine_binary_varint(&mut context.section.reader) as usize;
    for _ in 0..count {
        read_spine_binary_varint(&mut context.section.reader);
        let timelines = read_spine_binary_varint(&mut context.section.reader) as usize;
        for _ in 0..timelines {
            tally(
                counts(context, modeled),
                if modeled {
                    "path"
                } else {
                    SPINE_TIMELINE_KIND_PATH
                },
            );
            let kind = read_spine_binary_byte(&mut context.section.reader) as u32;
            let frames = read_spine_binary_varint(&mut context.section.reader) as usize;
            read_spine_binary_varint(&mut context.section.reader);
            let values = if kind == SPINE_BINARY_PATH_MIX { 3 } else { 1 };
            skip_spine_binary_curve_frames(&mut context.section.reader, frames, values * 4, values);
        }
    }
}

fn consume_transform(context: &mut SpineBinaryTimelineContext<'_, '_>, modeled: bool) {
    let count = read_spine_binary_varint(&mut context.section.reader) as usize;
    for _ in 0..count {
        tally(
            counts(context, modeled),
            if modeled {
                "transform"
            } else {
                SPINE_TIMELINE_KIND_TRANSFORM
            },
        );
        read_spine_binary_varint(&mut context.section.reader);
        let frames = read_spine_binary_varint(&mut context.section.reader) as usize;
        read_spine_binary_varint(&mut context.section.reader);
        skip_spine_binary_curve_frames(&mut context.section.reader, frames, 24, 6);
    }
}

fn counts<'a>(
    context: &'a mut SpineBinaryTimelineContext<'_, '_>,
    modeled: bool,
) -> &'a mut HashMap<String, usize> {
    return if modeled {
        &mut context.unmodeled_timeline_counts
    } else {
        &mut context.unregistered_timeline_counts
    };
}

pub fn skip_spine_binary_deform_timelines(context: &mut SpineBinaryTimelineContext<'_, '_>) {
    consume_deform(context, false);
}

pub fn skip_spine_binary_event_timelines(context: &mut SpineBinaryTimelineContext<'_, '_>) {
    consume_event(context, false);
}

pub fn skip_spine_binary_ik_timelines(context: &mut SpineBinaryTimelineContext<'_, '_>) {
    consume_ik(context, false);
}

pub fn skip_spine_binary_path_timelines(context: &mut SpineBinaryTimelineContext<'_, '_>) {
    consume_path(context, false);
}

pub fn skip_spine_binary_transform_timelines(context: &mut SpineBinaryTimelineContext<'_, '_>) {
    consume_transform(context, false);
}

pub fn spine_binary_deform_timeline_handler(context: &mut SpineBinaryTimelineContext<'_, '_>) {
    consume_deform(context, true);
}

pub fn spine_binary_event_timeline_handler(context: &mut SpineBinaryTimelineContext<'_, '_>) {
    consume_event(context, true);
}

pub fn spine_binary_ik_timeline_handler(context: &mut SpineBinaryTimelineContext<'_, '_>) {
    consume_ik(context, true);
}

pub fn spine_binary_path_timeline_handler(context: &mut SpineBinaryTimelineContext<'_, '_>) {
    consume_path(context, true);
}

pub fn spine_binary_transform_timeline_handler(context: &mut SpineBinaryTimelineContext<'_, '_>) {
    consume_transform(context, true);
}
