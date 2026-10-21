use std::collections::HashMap;

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};

use crate::spine_binary_reader::{
    is_spine_binary_reader_overrun, read_spine_binary_byte, read_spine_binary_varint,
    skip_spine_binary_bytes,
};
use crate::types::ByteReader;

pub const SPINE_BINARY_ATTACHMENT_SEQUENCE: u8 = 1;
pub const SPINE_BINARY_ATTACHMENT_TYPES: [&str; 7] = [
    "region",
    "boundingbox",
    "mesh",
    "linkedmesh",
    "path",
    "point",
    "clipping",
];
pub const SPINE_BINARY_BOUNDS_BYTES: usize = 16;
pub const SPINE_BINARY_COLOR_BYTES: usize = 4;
pub const SPINE_BINARY_CURVE_BEZIER: u8 = 2;
pub const SPINE_BINARY_CURVE_EPSILON: f32 = 1e-6;
pub const SPINE_BINARY_DEFAULT_SKIN_NAME: &str = "default";
pub const SPINE_BINARY_FPS_BYTES: usize = 4;
pub const SPINE_BINARY_HASH_BYTES: usize = 8;
pub const SPINE_BINARY_MESH_UV_BYTES: usize = 8;
pub const SPINE_BINARY_NO_ATTACHMENT_INDEX: i32 = -1;
pub const SPINE_BINARY_NO_DARK_COLOR: i32 = -1;
pub const SPINE_BINARY_PATH_MIX: u32 = 2;
pub const SPINE_BINARY_SKIN_REQUIREMENT_LISTS: usize = 4;
pub const SPINE_BINARY_SLOT_ATTACHMENT: u8 = 0;
pub const SPINE_BINARY_SLOT_RGBA: u8 = 1;
pub const SPINE_BINARY_TRIANGLE_INDEX_BYTES: usize = 2;

pub fn clamp_spine_binary_unit(value: f32) -> f32 {
    return value.clamp(0.0, 1.0);
}

pub fn read_spine_binary_string_reference(
    reader: &mut ByteReader<'_>,
    strings: &[Option<String>],
) -> Option<String> {
    let index = read_spine_binary_varint(reader) as usize;
    if index == 0 || index > strings.len() {
        return None;
    }
    return strings[index - 1].clone();
}

pub fn report_spine_binary_crumb(
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    count: usize,
    kind: &str,
    origin: &str,
    unit: &str,
) {
    if count == 0 {
        return;
    }
    let mut detail = HashMap::new();
    detail.insert(
        unit.to_string(),
        ImportDiagnosticDetailValue::Number(count as f32),
    );
    report_import_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Skip,
        kind,
        origin,
        Some(detail),
    );
}

pub fn skip_spine_binary_curve_frames(
    reader: &mut ByteReader<'_>,
    frame_count: usize,
    payload_bytes: usize,
    curve_values: usize,
) {
    if frame_count == 0 {
        return;
    }
    skip_spine_binary_bytes(reader, 4 + payload_bytes);
    for _ in 0..frame_count.saturating_sub(1) {
        if is_spine_binary_reader_overrun(reader) {
            break;
        }
        skip_spine_binary_bytes(reader, 4 + payload_bytes);
        skip_spine_binary_curve_tag(reader, curve_values);
    }
}

pub fn skip_spine_binary_curve_tag(reader: &mut ByteReader<'_>, curve_values: usize) {
    if read_spine_binary_byte(reader) == SPINE_BINARY_CURVE_BEZIER {
        skip_spine_binary_bytes(reader, curve_values * 16);
    }
}

pub fn tally(counts: &mut HashMap<String, usize>, kind: &str) {
    *counts.entry(kind.to_string()).or_default() += 1;
}
