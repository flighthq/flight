use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_materials::BLEND_MODE_NORMAL;

use crate::{
    EMPTY_ADJUSTMENTS, EMPTY_EFFECTS, SwfReader, SwfTagHandler, SwfTagHandlerRef, SwfTagParseState,
    SwfTagPlacement, SwfTagTimelineState, SwfTimeline, add_swf_timeline_label,
    read_swf_color_transform, read_swf_matrix, read_swf_rectangle, set_placement,
};

pub static SWF_CONTROL_HANDLER: LazyLock<SwfTagHandlerRef> = LazyLock::new(|| {
    Arc::new(SwfTagHandler {
        finish_timeline: None,
        instantiate: None,
        parse: Arc::new(|body, tag, state, timeline, _diagnostics| {
            if tag == TAG_SET_BACKGROUND_COLOR {
                read_swf_background_color(body, state);
            } else if tag == TAG_FRAME_LABEL {
                add_swf_timeline_label(
                    &mut timeline.labels,
                    timeline.frames.len() as i32 + 1,
                    &body.read_string(),
                );
            } else if tag == TAG_DEFINE_SCENE_AND_FRAME_LABEL_DATA {
                read_swf_scene_and_frame_label_data(body, timeline, state);
            } else if tag == TAG_DEFINE_SCALING_GRID {
                read_swf_scaling_grid(body, state);
            } else if tag == TAG_EXPORT_ASSETS || tag == TAG_SYMBOL_CLASS {
                read_swf_linkages(body, state);
            } else {
                read_swf_button_definition(
                    body,
                    state,
                    if tag == TAG_DEFINE_BUTTON_2 { 2 } else { 1 },
                );
            }
            return true;
        }),
        resolve: None,
        tags: vec![
            TAG_SET_BACKGROUND_COLOR,
            TAG_FRAME_LABEL,
            TAG_DEFINE_SCENE_AND_FRAME_LABEL_DATA,
            TAG_DEFINE_SCALING_GRID,
            TAG_EXPORT_ASSETS,
            TAG_SYMBOL_CLASS,
            TAG_DEFINE_BUTTON,
            TAG_DEFINE_BUTTON_2,
        ],
    })
});

fn read_swf_background_color(body: &mut SwfReader, state: &mut SwfTagParseState) {
    let red = body.read_uint8();
    let green = body.read_uint8();
    let blue = body.read_uint8();
    if body.valid {
        state.background_color = Some(
            u32::from(red) * 0x1000000
                + u32::from(green) * 0x10000
                + u32::from(blue) * 0x100
                + 0xff,
        );
    }
}

fn read_swf_button_definition(body: &SwfReader, state: &mut SwfTagParseState, version: u32) {
    let mut reader = SwfReader::new(body.source.clone(), body.pos, body.end);
    let button_id = u32::from(reader.read_uint16());
    if version == 2 {
        reader.read_uint8();
        reader.read_uint16();
    }
    if !reader.valid || button_id == 0 || state.defined_characters.contains(&button_id) {
        return;
    }

    let placements = Arc::new(RwLock::new(Vec::new()));
    for _ in 0..MAX_BUTTON_RECORDS {
        let flags = reader.read_uint8();
        if !reader.valid {
            return;
        }
        if flags == 0 {
            break;
        }
        let character_id = u32::from(reader.read_uint16());
        let depth = u32::from(reader.read_uint16());
        let matrix = read_swf_matrix(&mut reader);
        let color_transform = if version == 2 {
            Some(read_swf_color_transform(&mut reader, 4))
        } else {
            None
        };
        if !reader.valid {
            return;
        }
        if flags & BUTTON_STATE_UP == 0 && character_id != 0 {
            report_swf_button_interaction_state(state, character_id, flags);
        }
        if flags & BUTTON_STATE_UP != 0 && character_id != 0 {
            let color_adjustments = color_transform
                .as_ref()
                .and_then(|value| value.color_adjustments.clone());
            set_placement(
                &placements,
                depth,
                SwfTagPlacement {
                    advanced_blend_mode: None,
                    alpha: color_transform.as_ref().map_or(1.0, |value| value.alpha),
                    blend_mode: BLEND_MODE_NORMAL.to_string(),
                    character_id,
                    clip_depth: 0,
                    color_adjustments: color_adjustments.clone(),
                    color_transform_adjustments: color_adjustments,
                    depth,
                    direct_linkage: None,
                    effects: EMPTY_EFFECTS.clone(),
                    filter_adjustments: EMPTY_ADJUSTMENTS.clone(),
                    matrix,
                    name: None,
                    ratio: 0.0,
                },
            );
        }
        if flags & BUTTON_HAS_FILTER_LIST != 0 {
            break;
        }
        if flags & BUTTON_HAS_BLEND_MODE != 0 {
            reader.read_uint8();
        }
    }
    state.defined_characters.insert(button_id);
    state.sprites.insert(
        button_id,
        SwfTimeline {
            actions: Vec::new(),
            cues: Vec::new(),
            frames: vec![placements],
            labels: Vec::new(),
        },
    );
}

fn read_swf_linkages(body: &mut SwfReader, state: &mut SwfTagParseState) {
    let count = body.read_uint16();
    for _ in 0..count {
        if !body.valid {
            break;
        }
        let character_id = u32::from(body.read_uint16());
        let name = body.read_string();
        if !name.is_empty() {
            if !state.linkages.contains_key(&character_id) {
                state.linkage_order.push(character_id);
            }
            state.linkages.insert(character_id, name);
        }
    }
}

fn read_swf_scaling_grid(body: &mut SwfReader, state: &mut SwfTagParseState) {
    let character_id = u32::from(body.read_uint16());
    let splitter = read_swf_rectangle(body);
    if body.valid
        && character_id != 0
        && let Some(splitter) = splitter
    {
        state.scaling_grids.insert(character_id, splitter);
    }
}

fn read_swf_scene_and_frame_label_data(
    body: &mut SwfReader,
    timeline: &mut SwfTagTimelineState,
    state: &SwfTagParseState,
) {
    let scene_count = body.read_encoded_uint32();
    for _ in 0..scene_count {
        if !body.valid {
            break;
        }
        body.read_encoded_uint32();
        body.read_string();
    }
    if scene_count > 0 {
        report_swf_scene_names(state, scene_count);
    }
    let label_count = body.read_encoded_uint32();
    for _ in 0..label_count {
        if !body.valid {
            break;
        }
        let frame = body.read_encoded_uint32();
        let name = body.read_string();
        if body.valid {
            let frame = i32::try_from(frame).unwrap_or(i32::MAX).saturating_add(1);
            add_swf_timeline_label(&mut timeline.labels, frame, &name);
        }
    }
}

fn report_swf_button_interaction_state(state: &SwfTagParseState, character_id: u32, flags: u8) {
    let Some(diagnostics) = &state.diagnostics else {
        return;
    };
    let mut detail = HashMap::new();
    detail.insert(
        String::from("characterId"),
        ImportDiagnosticDetailValue::Number(character_id as f32),
    );
    detail.insert(
        String::from("flags"),
        ImportDiagnosticDetailValue::Number(f32::from(flags)),
    );
    report_import_diagnostic(
        Some(&mut diagnostics.write().unwrap()),
        ImportDiagnosticSeverity::Skip,
        "swf.button-interaction-state",
        "readSwfButtonDefinition",
        Some(detail),
    );
}

fn report_swf_scene_names(state: &SwfTagParseState, scene_count: u64) {
    let Some(diagnostics) = &state.diagnostics else {
        return;
    };
    let mut detail = HashMap::new();
    detail.insert(
        String::from("capability"),
        ImportDiagnosticDetailValue::String(String::from(
            "swf.timeline.define-scene-and-frame-label-data",
        )),
    );
    detail.insert(
        String::from("sceneCount"),
        ImportDiagnosticDetailValue::Number(scene_count as f32),
    );
    report_import_diagnostic(
        Some(&mut diagnostics.write().unwrap()),
        ImportDiagnosticSeverity::Skip,
        "swf.scene-names",
        "readSwfSceneAndFrameLabelData",
        Some(detail),
    );
}

const BUTTON_HAS_BLEND_MODE: u8 = 0x20;
const BUTTON_HAS_FILTER_LIST: u8 = 0x10;
const BUTTON_STATE_UP: u8 = 0x01;
const MAX_BUTTON_RECORDS: usize = 10_000;
const TAG_DEFINE_BUTTON: u32 = 7;
const TAG_DEFINE_BUTTON_2: u32 = 34;
const TAG_DEFINE_SCALING_GRID: u32 = 78;
const TAG_DEFINE_SCENE_AND_FRAME_LABEL_DATA: u32 = 86;
const TAG_EXPORT_ASSETS: u32 = 56;
const TAG_FRAME_LABEL: u32 = 43;
const TAG_SET_BACKGROUND_COLOR: u32 = 9;
const TAG_SYMBOL_CLASS: u32 = 76;
