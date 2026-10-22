use super::*;
use crate::gltf_diagnostics::flush_gltf_drops;
use crate::gltf_json::decode_gltf_json;
use crate::gltf_types::{GltfExternalBufferValues, GltfExternalBufferView};
use flight_buffer::{create_array_buffer_view, equals_array_buffer};
use flight_entity::set_record_value;
use serde_json::json;
use std::sync::{Arc, RwLock};

fn buffer_source(uri: Option<&str>) -> Ref<GltfBuffer> {
    let source = decode_gltf_json(&json!({"buffers":[{"byteLength":1,"uri":uri}]}));
    let out = source.source.read().unwrap().buffers.as_ref().unwrap()[0].clone();
    out.write().unwrap().uri = uri.map(str::to_string);
    return out;
}

fn view_bytes(view: &ArrayBufferView) -> Vec<u8> {
    return get_array_buffer_storage(&view.buffer).read().unwrap()
        [view.byte_offset..view.byte_offset + view.byte_length]
        .to_vec();
}

#[test]
fn uri_less_buffer_retains_original_binary_window_and_data_uri_allocates_fresh_bytes() {
    let backing = create_array_buffer_from_bytes(vec![90, 1, 2, 3, 91].into_boxed_slice());
    let binary = create_array_buffer_view(&backing, 1, 3, ArrayBufferViewKind::Uint8Array).unwrap();
    let decoded = decode_gltf_buffer(&buffer_source(None), Some(&binary), None, None);
    assert!(equals_array_buffer(&decoded.buffer, &binary.buffer));
    assert_eq!(decoded.byte_offset, 1);
    assert_eq!(view_bytes(&decoded), [1, 2, 3]);
    let data = decode_gltf_buffer(
        &buffer_source(Some("data:any;ignored,Z m9v==")),
        Some(&binary),
        None,
        None,
    );
    assert_eq!(view_bytes(&data), b"foo");
    assert!(!equals_array_buffer(&data.buffer, &binary.buffer));
}

#[test]
fn external_buffer_numeric_values_are_copied_and_use_uint8_truncation_and_modulo() {
    let source = Arc::new(RwLock::new(vec![
        -1.9,
        256.9,
        511.0,
        f32::NAN,
        f32::INFINITY,
        -0.0,
    ]));
    let mut options = external_options();
    set_record_value(
        &mut options.external_buffers.as_ref().unwrap().write().unwrap(),
        "mesh.bin".to_string(),
        GltfExternalBuffer::Values(GltfExternalBufferValues {
            values: source.clone(),
        }),
    );
    options.base_path = Some("ignored/".to_string());
    let decoded = decode_gltf_buffer(&buffer_source(Some("mesh.bin")), None, Some(&options), None);
    assert_eq!(view_bytes(&decoded), [255, 0, 255, 0, 0, 0]);
    source.write().unwrap()[0] = 10.0;
    assert_eq!(view_bytes(&decoded)[0], 255);
}

fn external_options() -> GltfImportOptions {
    return GltfImportOptions {
        base_path: None,
        extension_handlers: None,
        external_buffers: Some(empty_external_buffers()),
        draco_registry: None,
    };
}

fn empty_external_buffers() -> Ref<flight_entity::Record<GltfExternalBuffer>> {
    let constructor: fn() -> flight_entity::Record<GltfExternalBuffer> = Default::default;
    return Arc::new(RwLock::new(constructor()));
}

#[test]
fn external_typed_views_convert_elements_instead_of_copying_raw_storage_and_keep_large_integer_low_bytes()
 {
    let cases = [
        (
            ArrayBufferViewKind::Int8Array,
            vec![128, 255],
            vec![128, 255],
        ),
        (
            ArrayBufferViewKind::Uint16Array,
            [256_u16, 511]
                .iter()
                .flat_map(|v| v.to_le_bytes())
                .collect(),
            vec![0, 255],
        ),
        (
            ArrayBufferViewKind::Int16Array,
            [-257_i16, 257]
                .iter()
                .flat_map(|v| v.to_le_bytes())
                .collect(),
            vec![255, 1],
        ),
        (
            ArrayBufferViewKind::Uint32Array,
            [16777217_u32, u32::MAX]
                .iter()
                .flat_map(|v| v.to_le_bytes())
                .collect(),
            vec![1, 255],
        ),
        (
            ArrayBufferViewKind::Int32Array,
            [-16777217_i32, 16777217]
                .iter()
                .flat_map(|v| v.to_le_bytes())
                .collect(),
            vec![255, 1],
        ),
        (
            ArrayBufferViewKind::Float32Array,
            [-1.9_f32, 256.9]
                .iter()
                .flat_map(|v| v.to_le_bytes())
                .collect(),
            vec![255, 0],
        ),
        (
            ArrayBufferViewKind::Float64Array,
            [16777217.0_f64, -1.9]
                .iter()
                .flat_map(|v| v.to_le_bytes())
                .collect(),
            vec![1, 255],
        ),
        (
            ArrayBufferViewKind::Uint8ClampedArray,
            vec![0, 255],
            vec![0, 255],
        ),
        (ArrayBufferViewKind::DataView, vec![1, 2, 3], vec![]),
    ];
    for (kind, bytes, expected) in cases {
        let length = bytes.len();
        let mut payload = vec![77];
        payload.extend(bytes);
        payload.push(88);
        let buffer = create_array_buffer_from_bytes(payload.into_boxed_slice());
        let view = create_array_buffer_view(&buffer, 1, length, kind).unwrap();
        let options = external_options();
        set_record_value(
            &mut options.external_buffers.as_ref().unwrap().write().unwrap(),
            "exact.bin".to_string(),
            GltfExternalBuffer::View(GltfExternalBufferView { view }),
        );
        let decoded = decode_gltf_buffer(
            &buffer_source(Some("exact.bin")),
            None,
            Some(&options),
            None,
        );
        assert_eq!(view_bytes(&decoded), expected);
        assert!(!equals_array_buffer(&decoded.buffer, &buffer));
    }
}

#[test]
fn missing_buffers_tally_categorical_reasons_and_keep_first_exact_uri_without_base_path_lookup() {
    let options = external_options();
    let drops = Arc::new(RwLock::new(Vec::new()));
    for uri in [
        None,
        None,
        Some("first.bin"),
        Some("next.bin"),
        Some("data:bad"),
    ] {
        assert_eq!(
            decode_gltf_buffer(&buffer_source(uri), None, Some(&options), Some(&drops)).byte_length,
            0
        );
    }
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    flush_gltf_drops(Some(&diagnostics), Some(&drops));
    let diagnostics = diagnostics.read().unwrap();
    assert_eq!(diagnostics.len(), 2);
    assert_eq!(
        diagnostics[0].detail.as_ref().unwrap()["count"],
        ImportDiagnosticDetailValue::Number(2.0)
    );
    assert_eq!(
        diagnostics[0].detail.as_ref().unwrap()["reason"],
        ImportDiagnosticDetailValue::String("no-uri-no-binary".to_string())
    );
    assert_eq!(
        diagnostics[1].detail.as_ref().unwrap()["count"],
        ImportDiagnosticDetailValue::Number(3.0)
    );
    assert_eq!(
        diagnostics[1].detail.as_ref().unwrap()["firstUri"],
        ImportDiagnosticDetailValue::String("first.bin".to_string())
    );
    assert_eq!(diagnostics[1].severity, ImportDiagnosticSeverity::Recover);
}
