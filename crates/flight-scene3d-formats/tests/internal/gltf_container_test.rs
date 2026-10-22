use super::*;
use crate::gltf_json::gltf_original_number;
use crate::gltf_source::{GltfDocumentSource, GltfJsonSource};
use flight_buffer::{
    create_array_buffer_from_bytes, create_array_buffer_view, equals_array_buffer,
};
use std::sync::{Arc, RwLock};

fn byte_view(bytes: Vec<u8>, prefix: usize, suffix: usize) -> ArrayBufferView {
    let length = bytes.len();
    let mut backing = vec![0xff; prefix];
    backing.extend(bytes);
    backing.resize(backing.len() + suffix, 0xff);
    let buffer = create_array_buffer_from_bytes(backing.into_boxed_slice());
    return create_array_buffer_view(&buffer, prefix, length, ArrayBufferViewKind::Uint8Array)
        .unwrap();
}

fn glb_chunks(chunks: &[(u32, &[u8])]) -> Vec<u8> {
    let length: usize = 12
        + chunks
            .iter()
            .map(|(_, bytes)| bytes.len() + 8)
            .sum::<usize>();
    let mut out = Vec::new();
    for word in [0x46546c67, 2, length as u32] {
        out.extend(word.to_le_bytes());
    }
    for (kind, bytes) in chunks {
        out.extend((bytes.len() as u32).to_le_bytes());
        out.extend(kind.to_le_bytes());
        out.extend(*bytes);
    }
    return out;
}

#[test]
fn base64_matches_padding_noise_and_every_tail_length_including_source_single_char_behavior() {
    for (source, expected) in [
        ("", &[][..]),
        ("Zg==", &[102]),
        ("Zm8=", &[102, 111]),
        ("Zm9v", &[102, 111, 111]),
        (" Z!m\n9v=", &[102, 111, 111]),
        ("A", &[255]),
        ("Zm9vA", &[102, 111, 111, 255]),
        ("//8=", &[255, 255]),
    ] {
        assert_eq!(&*decode_gltf_base64(source), expected);
    }
}

#[test]
fn container_preserves_binary_backing_identity_and_absolute_offset_through_caller_subview() {
    let bytes = byte_view(
        glb_chunks(&[
            (0x4e4f534a, br#"{"asset":{"version":"2.0"}}"#),
            (0x004e4942, &[1, 2, 3, 4]),
        ]),
        3,
        20,
    );
    let container = read_glb_container(&bytes, None).unwrap();
    assert_eq!(
        container
            .document
            .source
            .read()
            .unwrap()
            .asset
            .as_ref()
            .unwrap()
            .read()
            .unwrap()
            .version,
        "2.0"
    );
    let binary = container.binary.unwrap();
    assert!(equals_array_buffer(&binary.buffer, &bytes.buffer));
    assert_eq!(
        binary.byte_offset,
        bytes.byte_offset + bytes.byte_length - 4
    );
    assert_eq!(binary.byte_length, 4);
    get_array_buffer_storage(&bytes.buffer).write().unwrap()[binary.byte_offset] = 99;
    assert_eq!(
        get_array_buffer_storage(&binary.buffer).read().unwrap()[binary.byte_offset],
        99
    );
}

#[test]
fn container_keeps_first_json_and_binary_ignores_unknown_chunks_and_decodes_textdecoder_bom_and_replacement()
 {
    let mut json = vec![0xef, 0xbb, 0xbf];
    json.extend(br#"{"asset":{"version":"2.0"},"nodes":[{"name":""#);
    json.extend([0xe2, 0x82, b'X']);
    json.extend(br#""}]}   "#);
    let bytes = byte_view(
        glb_chunks(&[
            (123, &[1, 2]),
            (0x004e4942, &[7]),
            (0x4e4f534a, &json),
            (0x004e4942, &[8, 9]),
            (0x4e4f534a, b"{"),
        ]),
        1,
        0,
    );
    let container = read_glb_container(&bytes, None).unwrap();
    assert_eq!(
        container
            .document
            .source
            .read()
            .unwrap()
            .nodes
            .as_ref()
            .unwrap()[0]
            .read()
            .unwrap()
            .name
            .as_deref(),
        Some("\u{FFFD}X")
    );
    assert_eq!(container.binary.unwrap().byte_length, 1);
}

#[test]
fn container_rejects_each_header_gate_with_exact_origin_and_version_detail() {
    let mut wrong_magic = glb_chunks(&[]);
    wrong_magic[0] = 0;
    let mut version = glb_chunks(&[]);
    version[4..8].copy_from_slice(&1_u32.to_le_bytes());
    for (payload, kind) in [
        (vec![0; 4], "glb.header-too-small"),
        (wrong_magic, "glb.wrong-magic"),
        (version, "glb.unsupported-version"),
        (glb_chunks(&[]), "glb.no-json-chunk"),
    ] {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        assert!(read_glb_container(&byte_view(payload, 2, 0), Some(&diagnostics)).is_none());
        let diagnostics = diagnostics.read().unwrap();
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, kind);
        assert_eq!(diagnostics[0].origin, "readGlbContainer");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Reject);
        if kind == "glb.unsupported-version" {
            assert_eq!(
                diagnostics[0].detail.as_ref().unwrap()["version"],
                ImportDiagnosticDetailValue::Number(1.0)
            );
        }
    }
}

#[test]
fn container_reports_oversize_recover_before_missing_json_reject_and_keeps_preceding_usable_json() {
    for valid_json_first in [false, true] {
        let mut payload = if valid_json_first {
            glb_chunks(&[(0x4e4f534a, b"{}"), (0x004e4942, &[])])
        } else {
            glb_chunks(&[(0x4e4f534a, b"{}")])
        };
        let chunk = if valid_json_first { 22 } else { 12 };
        payload[chunk..chunk + 4].copy_from_slice(&1000_u32.to_le_bytes());
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        assert_eq!(
            read_glb_container(&byte_view(payload, 1, 2000), Some(&diagnostics)).is_some(),
            valid_json_first
        );
        let diagnostics = diagnostics.read().unwrap();
        assert_eq!(diagnostics[0].kind, "glb.chunk-past-end");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
        assert_eq!(diagnostics.len(), if valid_json_first { 1 } else { 2 });
        if !valid_json_first {
            assert_eq!(diagnostics[1].kind, "glb.no-json-chunk");
        }
    }
}

#[test]
fn container_respects_both_declared_and_actual_length_and_does_not_read_caller_suffix() {
    let mut payload = glb_chunks(&[(0x4e4f534a, b"{}")]);
    payload[8..12].copy_from_slice(&12_u32.to_le_bytes());
    assert!(read_glb_container(&byte_view(payload, 0, 0), None).is_none());
    let mut payload = glb_chunks(&[(0x4e4f534a, b"{}")]);
    payload[8..12].copy_from_slice(&1000_u32.to_le_bytes());
    assert!(read_glb_container(&byte_view(payload, 0, 0), None).is_some());
    let payload = glb_chunks(&[(0x4e4f534a, b"{}")]);
    let mut view = byte_view(payload, 1, 0);
    view.byte_length -= 1;
    assert!(read_glb_container(&view, None).is_none());
}

#[test]
fn container_contains_invalid_json_but_keeps_source_null_and_scalar_chunk_behavior() {
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    assert!(
        read_glb_container(
            &byte_view(glb_chunks(&[(0x4e4f534a, b"{")]), 0, 0),
            Some(&diagnostics)
        )
        .is_none()
    );
    assert_eq!(
        diagnostics.read().unwrap()[0].kind,
        "glb.json-chunk-invalid"
    );
    diagnostics.write().unwrap().clear();
    assert!(
        read_glb_container(
            &byte_view(glb_chunks(&[(0x4e4f534a, b"null")]), 0, 0),
            Some(&diagnostics)
        )
        .is_none()
    );
    assert_eq!(diagnostics.read().unwrap()[0].kind, "glb.no-json-chunk");
    assert!(
        read_glb_container(
            &byte_view(
                glb_chunks(&[(0x4e4f534a, b"null"), (0x4e4f534a, b"{}")]),
                0,
                0
            ),
            None
        )
        .is_some()
    );
    assert!(
        read_glb_container(&byte_view(glb_chunks(&[(0x4e4f534a, b"42")]), 0, 0), None).is_some()
    );
}

#[test]
fn source_validation_retains_original_object_identity_and_original_integer_tokens() {
    let source = "{\"asset\":{\"version\":\"2.0\"},\"accessors\":[{\"componentType\":5126,\"count\":0.9999999999,\"type\":\"VEC3\"}]}";
    let decoded = parse_gltf_source(&GltfSource::Json(GltfJsonSource { source }), None).unwrap();
    let accessor = decoded.source.read().unwrap().accessors.as_ref().unwrap()[0].clone();
    assert_ne!(
        gltf_original_number(
            &decoded.metadata,
            &accessor,
            "count",
            accessor.read().unwrap().count
        )
        .fract(),
        0.0
    );
    let same = parse_gltf_source(
        &GltfSource::Document(GltfDocumentSource {
            source: &decoded.source,
        }),
        None,
    )
    .unwrap();
    assert!(Arc::ptr_eq(&same.source, &decoded.source));
    assert!(parse_gltf_source(&GltfSource::Json(GltfJsonSource { source: "[]" }), None).is_some());
}

#[test]
fn source_json_rejects_invalid_text_and_nonobjects_without_clearing_the_original_collector() {
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    for source in ["{", "42", "null", "true", "\"text\"", "\u{FEFF}{}"] {
        assert!(
            parse_gltf_source(
                &GltfSource::Json(GltfJsonSource { source }),
                Some(&diagnostics)
            )
            .is_none()
        );
    }
    let diagnostics = diagnostics.read().unwrap();
    assert_eq!(diagnostics.len(), 6);
    for (index, diagnostic) in diagnostics.iter().enumerate() {
        assert_eq!(diagnostic.origin, "parseGltfSource");
        assert_eq!(diagnostic.severity, ImportDiagnosticSeverity::Reject);
        assert_eq!(
            diagnostic.kind,
            if index == 0 || index == 5 {
                "gltf.invalid-json"
            } else {
                "gltf.not-an-object"
            }
        );
    }
}
