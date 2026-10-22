use crate::gltf_json::{GltfJsonDocument, decode_gltf_json, empty_gltf_json_metadata};
use crate::gltf_source::GltfSource;
use flight_buffer::{ArrayBufferView, ArrayBufferViewKind, get_array_buffer_storage};
use flight_encoding::decode_utf8;
use flight_entity::Ref;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use serde_json::Value;
use std::collections::HashMap;

#[cfg(test)]
#[path = "../tests/internal/gltf_container_test.rs"]
mod tests;

pub(crate) struct GltfContainer {
    pub binary: Option<ArrayBufferView>,
    pub document: GltfJsonDocument,
}

pub(crate) fn decode_gltf_base64(source: &str) -> Box<[u8]> {
    let stripped: Vec<i32> = source
        .bytes()
        .filter_map(|byte| {
            return match byte {
                b'A'..=b'Z' => Some((byte - b'A') as i32),
                b'a'..=b'z' => Some((byte - b'a' + 26) as i32),
                b'0'..=b'9' => Some((byte - b'0' + 52) as i32),
                b'+' => Some(62),
                b'/' => Some(63),
                _ => None,
            };
        })
        .collect();
    let mut out = Vec::new();
    for chunk in stripped.chunks(4) {
        // Source indexOf(undefined) yields -1 for a missing second sextet, including a one-char tail.
        let c0 = chunk[0];
        let c1 = chunk.get(1).copied().unwrap_or(-1);
        let c2 = chunk.get(2).copied().unwrap_or(-1);
        let c3 = chunk.get(3).copied().unwrap_or(-1);
        let value = (c0 << 18) | (c1 << 12) | (c2.max(0) << 6) | c3.max(0);
        out.push(((value >> 16) & 0xff) as u8);
        if c2 >= 0 {
            out.push(((value >> 8) & 0xff) as u8);
        }
        if c3 >= 0 {
            out.push((value & 0xff) as u8);
        }
    }
    return out.into_boxed_slice();
}

pub(crate) fn parse_gltf_source(
    source: &GltfSource<'_>,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Option<GltfJsonDocument> {
    return match source {
        GltfSource::Document(source) => Some(GltfJsonDocument {
            source: source.source.clone(),
            metadata: empty_gltf_json_metadata(),
        }),
        GltfSource::Json(source) => {
            let value = match serde_json::from_str::<Value>(source.source) {
                Ok(value) => value,
                Err(_) => {
                    report_gltf_container_diagnostic(
                        diagnostics,
                        ImportDiagnosticSeverity::Reject,
                        "gltf.invalid-json",
                        "parseGltfSource",
                        None,
                    );
                    return None;
                }
            };
            if !value.is_object() && !value.is_array() {
                report_gltf_container_diagnostic(
                    diagnostics,
                    ImportDiagnosticSeverity::Reject,
                    "gltf.not-an-object",
                    "parseGltfSource",
                    None,
                );
                return None;
            }
            Some(decode_gltf_json(&value))
        }
    };
}

pub(crate) fn read_glb_container(
    bytes: &ArrayBufferView,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Option<GltfContainer> {
    let storage = get_array_buffer_storage(&bytes.buffer);
    let storage = storage.read().unwrap();
    let source = bytes
        .byte_offset
        .checked_add(bytes.byte_length)
        .and_then(|end| storage.get(bytes.byte_offset..end));
    let Some(source) = source.filter(|source| source.len() >= 12) else {
        report_gltf_container_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "glb.header-too-small",
            "readGlbContainer",
            None,
        );
        return None;
    };
    let word = |offset: usize| u32::from_le_bytes(source[offset..offset + 4].try_into().unwrap());
    if word(0) != 0x46546c67 {
        report_gltf_container_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "glb.wrong-magic",
            "readGlbContainer",
            None,
        );
        return None;
    }
    let version = word(4);
    if version != 2 {
        report_gltf_container_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "glb.unsupported-version",
            "readGlbContainer",
            Some(HashMap::from([(
                "version".to_string(),
                ImportDiagnosticDetailValue::Number(version as f32),
            )])),
        );
        return None;
    }
    let end = (word(8) as usize).min(source.len());
    let mut offset = 12;
    let mut document = None;
    let mut binary = None;
    while offset + 8 <= end {
        let chunk_length = word(offset) as usize;
        let chunk_type = word(offset + 4);
        let data_start = offset + 8;
        let data_end = data_start.checked_add(chunk_length);
        let Some(data_end) = data_end.filter(|data_end| *data_end <= end) else {
            report_gltf_container_diagnostic(
                diagnostics,
                ImportDiagnosticSeverity::Recover,
                "glb.chunk-past-end",
                "readGlbContainer",
                None,
            );
            break;
        };
        if chunk_type == 0x4e4f534a && document.is_none() {
            let decoded = decode_utf8(&source[data_start..data_end], None, None);
            let decoded = decoded.strip_prefix('\u{FEFF}').unwrap_or(&decoded);
            match serde_json::from_str::<Value>(decoded) {
                Ok(value) => {
                    if !value.is_null() {
                        document = Some(decode_gltf_json(&value));
                    }
                }
                Err(_) => {
                    report_gltf_container_diagnostic(
                        diagnostics,
                        ImportDiagnosticSeverity::Reject,
                        "glb.json-chunk-invalid",
                        "readGlbContainer",
                        None,
                    );
                    return None;
                }
            }
        } else if chunk_type == 0x004e4942 && binary.is_none() {
            binary = Some(ArrayBufferView {
                buffer: bytes.buffer.clone(),
                byte_offset: bytes.byte_offset + data_start,
                byte_length: chunk_length,
                kind: ArrayBufferViewKind::Uint8Array,
            });
        }
        offset = data_end;
    }
    let Some(document) = document else {
        report_gltf_container_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "glb.no-json-chunk",
            "readGlbContainer",
            None,
        );
        return None;
    };
    return Some(GltfContainer { binary, document });
}

fn report_gltf_container_diagnostic(
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    origin: &str,
    detail: Option<HashMap<String, ImportDiagnosticDetailValue>>,
) {
    if let Some(diagnostics) = diagnostics {
        report_import_diagnostic(
            Some(&mut diagnostics.write().unwrap()),
            severity,
            kind,
            origin,
            detail,
        );
    }
}
