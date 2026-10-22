use crate::three_ds_read::{read_three_ds_f32, read_three_ds_u16, read_three_ds_u32};
use crate::three_ds_schema::*;
use crate::three_ds_types::{ThreeDsChunkDispatch, ThreeDsDropTallyEntry, ThreeDsParseState};
use flight_entity::{Uint8Array, throw_range_error};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_scene3d::{Scene3DDocument, Scene3DDocumentScene};
use std::collections::HashMap;
use std::sync::Arc;

pub fn pack_three_ds_color(rgb: &[f32; 3], alpha: Option<f32>) -> u32 {
    let channel = |value: f32| -> u32 {
        return (value.clamp(0.0, 1.0) * 255.0).round() as u32;
    };
    return (channel(rgb[0]) << 24)
        | (channel(rgb[1]) << 16)
        | (channel(rgb[2]) << 8)
        | channel(alpha.unwrap_or(1.0));
}

pub fn parse_color_chunk(view: &Uint8Array, offset: usize, end: usize) -> Option<[f32; 3]> {
    let mut cursor = offset;
    while cursor + THREE_DS_CHUNK_HEADER_BYTES <= end {
        let chunk_id = read_three_ds_u16(view, cursor);
        let chunk_end = read_chunk_end(view, cursor, end);
        if chunk_end < 0 {
            break;
        }
        let chunk_end = chunk_end as usize;
        let data_start = cursor + THREE_DS_CHUNK_HEADER_BYTES;
        if chunk_id == THREE_DS_COLOR_FLOAT && data_start + 12 <= chunk_end {
            return Some([
                read_three_ds_f32(view, data_start),
                read_three_ds_f32(view, data_start + 4),
                read_three_ds_f32(view, data_start + 8),
            ]);
        }
        if chunk_id == THREE_DS_COLOR_BYTE && data_start + 3 <= chunk_end {
            return Some([
                view[data_start] as f32 / 255.0,
                view[data_start + 1] as f32 / 255.0,
                view[data_start + 2] as f32 / 255.0,
            ]);
        }
        cursor = chunk_end;
    }
    return None;
}

pub fn parse_three_ds_document_with_dispatch(
    bytes: &Uint8Array,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    dispatch: &ThreeDsChunkDispatch,
) -> Scene3DDocument {
    let mut document = Scene3DDocument {
        animations: Vec::new(),
        cameras: Vec::new(),
        lights: Vec::new(),
        materials: Vec::new(),
        meshes: Vec::new(),
        metadata: None,
        nodes: Vec::new(),
        resources: Vec::new(),
        scenes: vec![Scene3DDocumentScene {
            name: None,
            root_nodes: Vec::new(),
        }],
        skins: Vec::new(),
    };
    if bytes.len() < THREE_DS_CHUNK_HEADER_BYTES {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "3ds.input-too-small",
            "parse3ds",
            None,
        );
        return document;
    }
    let main_id = read_three_ds_u16(bytes, 0);
    if main_id != THREE_DS_MAIN {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "3ds.wrong-main-chunk",
            "parse3ds",
            Some(HashMap::from([(
                "foundId".to_string(),
                ImportDiagnosticDetailValue::Number(main_id as f32),
            )])),
        );
        return document;
    }
    let drops = diagnostics.as_ref().map(|_| Vec::new());
    let mut state = ThreeDsParseState {
        cameras: Vec::new(),
        diagnostics: diagnostics.as_deref_mut(),
        document: &mut document,
        drops,
        lights: Vec::new(),
        materials: Vec::new(),
        meshes: Vec::new(),
        pivots: Vec::new(),
    };
    walk_three_ds_chunks(bytes, 0, &mut state, dispatch);
    let mut built = Vec::new();
    for entry in dispatch {
        let build = entry.handler.read().unwrap().build.clone();
        if let Some(build) = build {
            if !built
                .iter()
                .any(|handler| Arc::ptr_eq(handler, &entry.handler))
            {
                built.push(entry.handler.clone());
                build(&mut state);
            }
        }
    }
    if let Some(drops) = state.drops.take() {
        for entry in drops {
            let mut detail = entry.value.detail;
            detail.insert(
                "count".to_string(),
                ImportDiagnosticDetailValue::Number(entry.value.count as f32),
            );
            report_import_diagnostic(
                state.diagnostics.as_deref_mut(),
                entry.value.severity,
                &entry.value.kind,
                "parse3ds",
                Some(detail),
            );
        }
    }
    return document;
}

// flight-lint: allow(contract-vocabulary) range -1..=2^33 (cursor + u32 chunk length; 3DS -1 sentinel)
pub fn read_chunk_end(view: &Uint8Array, cursor: usize, end: usize) -> i64 {
    let length = read_chunk_length(view, cursor) as i64;
    if length < THREE_DS_CHUNK_HEADER_BYTES as i64 {
        return -1;
    }
    let chunk_end = cursor as i64 + length;
    return if chunk_end > end as i64 {
        -1
    } else {
        chunk_end
    };
}

pub fn read_chunk_length(view: &Uint8Array, offset: usize) -> u32 {
    return read_three_ds_u32(
        view,
        offset
            .checked_add(2)
            .unwrap_or_else(|| throw_range_error("Offset is outside the bounds of the DataView")),
    );
}

pub fn read_null_terminated_string(view: &Uint8Array, offset: usize, end: usize) -> String {
    let mut out = String::new();
    let mut cursor = offset;
    while cursor < end {
        let byte = *view
            .get(cursor)
            .unwrap_or_else(|| throw_range_error("Offset is outside the bounds of the DataView"));
        if byte == 0 {
            break;
        }
        out.push(char::from(byte));
        cursor += 1;
    }
    return out;
}

pub fn tally_three_ds_drop(
    tallies: Option<&mut Vec<ThreeDsDropTallyEntry>>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    discriminator: &str,
    first_detail: HashMap<String, ImportDiagnosticDetailValue>,
) {
    let Some(tallies) = tallies else {
        return;
    };
    let key = format!("{kind}|{discriminator}");
    if let Some(entry) = tallies.iter_mut().find(|entry| entry.key == key) {
        entry.value.count += 1;
    } else {
        tallies.push(ThreeDsDropTallyEntry {
            key,
            value: ThreeDsDropTally {
                count: 1,
                detail: first_detail,
                kind: kind.to_string(),
                severity,
            },
        });
    }
}

fn walk_three_ds_chunks(
    view: &Uint8Array,
    offset: usize,
    state: &mut ThreeDsParseState,
    dispatch: &ThreeDsChunkDispatch,
) {
    let end = (offset + read_chunk_length(view, offset) as usize).min(view.len());
    let mut cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
    while cursor + THREE_DS_CHUNK_HEADER_BYTES <= end {
        let chunk_id = read_three_ds_u16(view, cursor);
        let chunk_length = read_chunk_length(view, cursor);
        let chunk_end = read_chunk_end(view, cursor, end);
        if chunk_end < 0 {
            tally_three_ds_drop(
                state.drops.as_mut(),
                ImportDiagnosticSeverity::Recover,
                "3ds.chunk-exceeds-parent",
                "",
                HashMap::from([
                    (
                        "firstChunkId".to_string(),
                        ImportDiagnosticDetailValue::Number(chunk_id as f32),
                    ),
                    (
                        "firstLength".to_string(),
                        ImportDiagnosticDetailValue::Number(chunk_length as f32),
                    ),
                    (
                        "firstOffset".to_string(),
                        ImportDiagnosticDetailValue::Number(cursor as f32),
                    ),
                ]),
            );
            break;
        }
        let chunk_end = chunk_end as usize;
        if let Some(entry) = dispatch.iter().find(|entry| entry.chunk_id == chunk_id) {
            let collect = entry.handler.read().unwrap().collect.clone();
            collect(state, view, cursor, chunk_end, "");
        } else if [THREE_DS_EDITOR, THREE_DS_MAIN, THREE_DS_KEYFRAME].contains(&chunk_id) {
            walk_three_ds_chunks(view, cursor, state, dispatch);
        } else if chunk_id == THREE_DS_OBJECT {
            walk_three_ds_object(view, cursor, chunk_end, state, dispatch);
        }
        cursor = chunk_end;
    }
}

fn walk_three_ds_object(
    view: &Uint8Array,
    offset: usize,
    end: usize,
    state: &mut ThreeDsParseState,
    dispatch: &ThreeDsChunkDispatch,
) {
    let mut cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
    let name = read_null_terminated_string(view, cursor, end);
    cursor += name.chars().count() + 1;
    while cursor + THREE_DS_CHUNK_HEADER_BYTES <= end {
        let chunk_id = read_three_ds_u16(view, cursor);
        let chunk_end = read_chunk_end(view, cursor, end);
        if chunk_end < 0 {
            tally_three_ds_drop(
                state.drops.as_mut(),
                ImportDiagnosticSeverity::Recover,
                "3ds.subchunk-exceeds-object",
                "",
                HashMap::from([(
                    "firstOffset".to_string(),
                    ImportDiagnosticDetailValue::Number(cursor as f32),
                )]),
            );
            return;
        }
        let chunk_end = chunk_end as usize;
        if let Some(entry) = dispatch.iter().find(|entry| entry.chunk_id == chunk_id) {
            let collect = entry.handler.read().unwrap().collect.clone();
            collect(state, view, cursor, chunk_end, &name);
            return;
        }
        cursor = chunk_end;
    }
    tally_three_ds_drop(
        state.drops.as_mut(),
        ImportDiagnosticSeverity::Skip,
        "3ds.non-entity-object",
        "",
        HashMap::from([(
            "firstName".to_string(),
            ImportDiagnosticDetailValue::String(name),
        )]),
    );
}
