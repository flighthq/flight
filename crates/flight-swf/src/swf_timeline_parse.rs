use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_timeline::contract::TimelineLabel;

use crate::{
    SWF_NON_CONTENT_TAGS, SwfReader, SwfTagHandlerDispatch, SwfTagHandlerRef, SwfTagParseState,
    SwfTagTimelineState, SwfTimeline, is_known_swf_tag,
};

pub fn add_swf_timeline_label(labels: &mut Vec<TimelineLabel>, frame: i32, name: &str) {
    if name.is_empty()
        || labels
            .iter()
            .any(|label| label.frame == frame && label.name == name)
    {
        return;
    }
    labels.push(TimelineLabel {
        frame,
        name: name.to_string(),
    });
}

fn collect_swf_timeline_finishers(dispatch: &SwfTagHandlerDispatch) -> Vec<SwfTagHandlerRef> {
    let mut families: Vec<SwfTagHandlerRef> = Vec::new();
    for family in dispatch.values() {
        if family.finish_timeline.is_some()
            && !families
                .iter()
                .any(|existing| Arc::ptr_eq(existing, family))
        {
            families.push(family.clone());
        }
    }
    return families;
}

pub fn read_swf_timeline(
    reader: &mut SwfReader,
    state: &mut SwfTagParseState,
) -> Option<SwfTimeline> {
    let mut timeline = SwfTagTimelineState {
        actions: Vec::new(),
        cues: Vec::new(),
        frames: Vec::new(),
        labels: Vec::new(),
        placements: Arc::new(RwLock::new(Vec::new())),
        stream_chunks: Vec::new(),
        stream_format: -1,
        stream_start_frame: 1,
    };

    while reader.pos < reader.end && reader.valid {
        let tag_header = reader.read_uint16();
        let code = u32::from(tag_header >> 6);
        let short_length = u32::from(tag_header & 0x3f);
        let length = if short_length == 0x3f {
            reader.read_uint32()
        } else {
            short_length
        };
        let Some(body_end) = reader.pos.checked_add(length as usize) else {
            return None;
        };
        if !reader.valid || body_end > reader.end {
            return None;
        }

        let mut body = SwfReader::new(reader.source.clone(), reader.pos, body_end);
        reader.pos = body_end;
        if code == TAG_END {
            break;
        }
        if code == TAG_SHOW_FRAME {
            let placement_count = timeline.placements.read().unwrap().len();
            let remaining = i64::from(state.remaining_frame_entries) - placement_count as i64 - 1;
            state.remaining_frame_entries = remaining.max(i64::from(i32::MIN)) as i32;
            if remaining < 0 {
                return None;
            }
            let snapshot = timeline.placements.read().unwrap().clone();
            timeline.frames.push(Arc::new(RwLock::new(snapshot)));
        } else if let Some(family) = state.dispatch.get(&code).cloned() {
            let diagnostics = state.diagnostics.clone();
            if !(family.parse)(&mut body, code, state, &mut timeline, diagnostics) {
                return None;
            }
        } else {
            report_swf_unhandled_tag(state.diagnostics.as_ref(), code);
        }
        if !body.valid {
            return None;
        }
    }

    if !reader.valid {
        return None;
    }
    if timeline.frames.is_empty() {
        timeline.frames.push(timeline.placements.clone());
    }
    for family in collect_swf_timeline_finishers(&state.dispatch) {
        if let Some(finish_timeline) = &family.finish_timeline {
            finish_timeline(state, &mut timeline);
        }
    }

    let frame_count = timeline.frames.len() as i32;
    let original_label_count = timeline.labels.len();
    timeline.labels.retain(|label| label.frame <= frame_count);
    let dropped_labels = original_label_count - timeline.labels.len();
    if dropped_labels != 0 {
        report_swf_dropped_entries(
            state.diagnostics.as_ref(),
            "swf.label-past-last-frame",
            dropped_labels,
            frame_count,
            Some("swf.timeline.frame-label"),
        );
    }

    let original_cue_count = timeline.cues.len();
    timeline
        .cues
        .retain(|cue| cue.read().unwrap().timeline_cue_fields().frame <= frame_count);
    let dropped_cues = original_cue_count - timeline.cues.len();
    if dropped_cues != 0 {
        report_swf_dropped_entries(
            state.diagnostics.as_ref(),
            "swf.cue-past-last-frame",
            dropped_cues,
            frame_count,
            None,
        );
    }
    timeline.labels.sort_by_key(|label| label.frame);

    return Some(SwfTimeline {
        actions: timeline.actions,
        cues: timeline.cues,
        frames: timeline.frames,
        labels: timeline.labels,
    });
}

fn report_swf_dropped_entries(
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    kind: &str,
    dropped: usize,
    frames: i32,
    capability: Option<&str>,
) {
    let Some(diagnostics) = diagnostics else {
        return;
    };
    let mut detail = HashMap::new();
    if let Some(capability) = capability {
        detail.insert(
            String::from("capability"),
            ImportDiagnosticDetailValue::String(capability.to_string()),
        );
    }
    detail.insert(
        String::from("dropped"),
        ImportDiagnosticDetailValue::Number(dropped as f32),
    );
    detail.insert(
        String::from("frames"),
        ImportDiagnosticDetailValue::Number(frames as f32),
    );
    report_import_diagnostic(
        Some(&mut diagnostics.write().unwrap()),
        ImportDiagnosticSeverity::Drop,
        kind,
        "readSwfTimeline",
        Some(detail),
    );
}

fn report_swf_unhandled_tag(diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>, code: u32) {
    let Some(diagnostics) = diagnostics else {
        return;
    };
    let (kind, capability) = match code {
        17 => ("swf.define-button-sound", None),
        57 | 71 => ("swf.import-assets", None),
        61 => ("swf.video-frame-payload", Some("swf.video.video-frame")),
        87 => ("swf.define-binary-data", None),
        91 => ("swf.define-font-4", None),
        _ if SWF_NON_CONTENT_TAGS.contains(&code) => return,
        _ if is_known_swf_tag(code as i32) => ("swf.tag-handler-unregistered", None),
        _ => ("swf.tag-unknown", None),
    };
    let mut detail = HashMap::new();
    if let Some(capability) = capability {
        detail.insert(
            String::from("capability"),
            ImportDiagnosticDetailValue::String(capability.to_string()),
        );
    }
    detail.insert(
        String::from("tag"),
        ImportDiagnosticDetailValue::Number(code as f32),
    );
    report_import_diagnostic(
        Some(&mut diagnostics.write().unwrap()),
        ImportDiagnosticSeverity::Skip,
        kind,
        "readSwfTimeline",
        Some(detail),
    );
}

pub const MAX_TIMELINE_FRAME_ENTRIES: i32 = 1_000_000;

const TAG_END: u32 = 0;
const TAG_SHOW_FRAME: u32 = 1;
