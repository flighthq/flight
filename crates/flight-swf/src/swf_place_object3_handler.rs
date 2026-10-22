use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_materials::BLEND_MODE_NORMAL;

use crate::swf_place_object_handler::set_placement;
use crate::{
    EMPTY_ADJUSTMENTS, EMPTY_EFFECTS, IDENTITY_MATRIX, SwfAdjustmentRef, SwfColorTransform,
    SwfReader, SwfTagHandler, SwfTagHandlerRef, SwfTagPlacement, SwfTagPlacementsRef,
    join_swf_color_adjustments, read_swf_color_transform, read_swf_filter_list, read_swf_matrix,
    resolve_swf_advanced_blend_mode, resolve_swf_blend_mode,
};

pub static SWF_PLACE_OBJECT3_HANDLER: LazyLock<SwfTagHandlerRef> = LazyLock::new(|| {
    Arc::new(SwfTagHandler {
        finish_timeline: None,
        instantiate: None,
        parse: Arc::new(|body, _tag, state, timeline, diagnostics| {
            read_place_object_3(
                body,
                &timeline.placements,
                &state.guard_state,
                diagnostics.as_ref(),
            );
            return true;
        }),
        resolve: None,
        tags: vec![TAG_PLACE_OBJECT_3, TAG_PLACE_OBJECT_4],
    })
});

fn append_diagnostics(
    diagnostics: Option<&flight_entity::Ref<Vec<ImportDiagnostic>>>,
    mut entries: Vec<ImportDiagnostic>,
) {
    if entries.is_empty() {
        return;
    }
    if let Some(diagnostics) = diagnostics {
        diagnostics.write().unwrap().append(&mut entries);
    }
}

fn find_placement(placements: &SwfTagPlacementsRef, depth: u32) -> Option<SwfTagPlacement> {
    return placements
        .read()
        .unwrap()
        .iter()
        .find(|(key, _)| *key == depth)
        .map(|(_, placement)| placement.clone());
}

fn read_place_object_3(
    body: &mut SwfReader,
    placements: &SwfTagPlacementsRef,
    guard_state: &crate::SwfGuardStateRef,
    diagnostics: Option<&flight_entity::Ref<Vec<ImportDiagnostic>>>,
) {
    let flags = body.read_uint8();
    let extended_flags = body.read_uint8();
    let depth = u32::from(body.read_uint16());
    let existing = find_placement(placements, depth);
    let is_move = flags & PLACE_MOVE != 0;
    let inherited = if is_move { existing.as_ref() } else { None };
    let has_character = flags & PLACE_HAS_CHARACTER != 0;
    let has_class_name = extended_flags & PLACE3_HAS_CLASS_NAME != 0
        || (extended_flags & PLACE3_HAS_IMAGE != 0 && has_character);
    let direct_linkage = if has_class_name {
        Some(body.read_string())
    } else {
        inherited.and_then(|placement| placement.direct_linkage.clone())
    };
    let character_id = if has_character {
        u32::from(body.read_uint16())
    } else {
        inherited.map_or(0, |placement| placement.character_id)
    };
    let matrix = if flags & PLACE_HAS_MATRIX != 0 {
        read_swf_matrix(body)
    } else {
        inherited.map_or(IDENTITY_MATRIX, |placement| placement.matrix)
    };
    let color_transform = if flags & PLACE_HAS_COLOR_TRANSFORM != 0 {
        read_swf_color_transform(body, 4)
    } else {
        SwfColorTransform {
            alpha: inherited.map_or(1.0, |placement| placement.alpha),
            color_adjustments: inherited
                .and_then(|placement| placement.color_transform_adjustments.clone()),
        }
    };
    let ratio = if flags & PLACE_HAS_RATIO != 0 {
        f32::from(body.read_uint16()) / MORPH_RATIO_ONE
    } else {
        inherited.map_or(0.0, |placement| placement.ratio)
    };
    let name = if flags & PLACE_HAS_NAME != 0 {
        Some(body.read_string())
    } else {
        inherited.and_then(|placement| placement.name.clone())
    };
    let clip_depth = if flags & PLACE_HAS_CLIP_DEPTH != 0 {
        u32::from(body.read_uint16())
    } else {
        inherited.map_or(0, |placement| placement.clip_depth)
    };

    let has_filter_list = extended_flags & PLACE3_HAS_FILTER_LIST != 0;
    let mut read_effects = Vec::new();
    let mut read_filter_adjustments: Vec<SwfAdjustmentRef> = Vec::new();
    let mut filter_diagnostics = Vec::new();
    let filter_list_complete = !has_filter_list
        || read_swf_filter_list(
            guard_state,
            body,
            &mut read_effects,
            &mut read_filter_adjustments,
            diagnostics.map(|_| &mut filter_diagnostics),
        );
    append_diagnostics(diagnostics, filter_diagnostics);
    let declares_blend_mode = extended_flags & PLACE3_HAS_BLEND_MODE != 0;
    let has_blend_mode = declares_blend_mode && filter_list_complete;
    if declares_blend_mode && !filter_list_complete {
        report_unread_filter_blend_mode(diagnostics);
    }
    let blend_mode_value = if has_blend_mode {
        u32::from(body.read_uint8())
    } else {
        0
    };

    if !body.valid
        || (is_move && existing.is_none())
        || (character_id == 0 && direct_linkage.is_none())
    {
        return;
    }
    let effects = if has_filter_list {
        Arc::new(read_effects)
    } else {
        inherited.map_or_else(
            || EMPTY_EFFECTS.clone(),
            |placement| placement.effects.clone(),
        )
    };
    let filter_adjustments = if has_filter_list {
        Arc::new(read_filter_adjustments)
    } else {
        inherited.map_or_else(
            || EMPTY_ADJUSTMENTS.clone(),
            |placement| placement.filter_adjustments.clone(),
        )
    };
    set_placement(
        placements,
        depth,
        SwfTagPlacement {
            advanced_blend_mode: if has_blend_mode {
                resolve_swf_advanced_blend_mode(blend_mode_value)
            } else {
                inherited.and_then(|placement| placement.advanced_blend_mode.clone())
            },
            alpha: color_transform.alpha,
            blend_mode: if has_blend_mode {
                resolve_swf_blend_mode(blend_mode_value)
            } else {
                inherited.map_or_else(
                    || BLEND_MODE_NORMAL.to_string(),
                    |placement| placement.blend_mode.clone(),
                )
            },
            character_id,
            clip_depth,
            color_adjustments: join_swf_color_adjustments(
                color_transform.color_adjustments.as_ref(),
                &filter_adjustments,
            ),
            color_transform_adjustments: color_transform.color_adjustments,
            depth,
            direct_linkage,
            effects,
            filter_adjustments,
            matrix,
            name,
            ratio,
        },
    );
}

fn report_unread_filter_blend_mode(
    diagnostics: Option<&flight_entity::Ref<Vec<ImportDiagnostic>>>,
) {
    let Some(diagnostics) = diagnostics else {
        return;
    };
    let mut detail = HashMap::new();
    detail.insert(
        String::from("capability"),
        ImportDiagnosticDetailValue::String(String::from("swf.placement.blend-mode")),
    );
    report_import_diagnostic(
        Some(&mut diagnostics.write().unwrap()),
        ImportDiagnosticSeverity::Drop,
        "swf.blend-mode-behind-unread-filters",
        "readPlaceObject",
        Some(detail),
    );
}

const MORPH_RATIO_ONE: f32 = 0xffff as f32;
const PLACE3_HAS_BLEND_MODE: u8 = 0x02;
const PLACE3_HAS_CLASS_NAME: u8 = 0x08;
const PLACE3_HAS_FILTER_LIST: u8 = 0x01;
const PLACE3_HAS_IMAGE: u8 = 0x10;
const PLACE_HAS_CHARACTER: u8 = 0x02;
const PLACE_HAS_CLIP_DEPTH: u8 = 0x40;
const PLACE_HAS_COLOR_TRANSFORM: u8 = 0x08;
const PLACE_HAS_MATRIX: u8 = 0x04;
const PLACE_HAS_NAME: u8 = 0x20;
const PLACE_HAS_RATIO: u8 = 0x10;
const PLACE_MOVE: u8 = 0x01;
const TAG_PLACE_OBJECT_3: u32 = 70;
const TAG_PLACE_OBJECT_4: u32 = 94;
