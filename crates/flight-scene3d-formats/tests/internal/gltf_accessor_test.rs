use super::*;
use crate::gltf_diagnostics::{flush_gltf_drops, report_gltf_accessor_fault};
use crate::gltf_json::decode_gltf_json;
use flight_buffer::{
    ArrayBufferViewKind, create_array_buffer_from_bytes, create_array_buffer_view,
};
use flight_importdiagnostics::ImportDiagnosticDetailValue;
use serde_json::{Value, json};

fn accessor_reader(
    source: Value,
    payload: Vec<u8>,
    prefix: usize,
    suffix: usize,
) -> GltfAccessorReader {
    let decoded = decode_gltf_json(&source);
    let length = payload.len();
    let mut storage = vec![0x7f; prefix];
    storage.extend(payload);
    storage.resize(storage.len() + suffix, 0x7f);
    let buffer = create_array_buffer_from_bytes(storage.into_boxed_slice());
    return GltfAccessorReader {
        buffers: vec![
            create_array_buffer_view(&buffer, prefix, length, ArrayBufferViewKind::Uint8Array)
                .unwrap(),
        ],
        drops: Some(Arc::new(RwLock::new(Vec::new()))),
        metadata: decoded.metadata,
        source: decoded.source,
    };
}

fn f32_bytes(values: &[f32]) -> Vec<u8> {
    return values
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
}

fn float_values(result: &GltfAccessorData) -> Vec<f32> {
    let GltfComponentArray::Float32(values) = &result.data else {
        panic!("expected Float32Array")
    };
    return values.values.read().unwrap().to_vec();
}

#[test]
fn bounds_reads_by_both_declared_window_and_original_caller_view_with_unaligned_offsets() {
    let mut payload = vec![0x55];
    payload.extend(f32_bytes(&[1.0, 2.0, 3.0]));
    let reader = accessor_reader(
        json!({"accessors":[{"bufferView":0,"componentType":5126,"count":1,"type":"VEC3"}],"bufferViews":[{"buffer":0,"byteOffset":1,"byteLength":12}]}),
        payload,
        3,
        20,
    );
    let result = read_gltf_accessor(&reader, 0, Some("VEC3"));
    assert_eq!(result.count, 1);
    assert!(result.fault.is_none());
    assert_eq!(float_values(&result), [1.0, 2.0, 3.0]);
    let view = reader.source.read().unwrap().buffer_views.as_ref().unwrap()[0].clone();
    view.write().unwrap().byte_length = 4.0;
    assert_eq!(
        read_gltf_accessor(&reader, 0, Some("VEC3"))
            .fault
            .unwrap()
            .read()
            .unwrap()
            .kind,
        "gltf.accessor-invalid-read"
    );
    view.write().unwrap().byte_length = 100.0;
    let accessor = reader.source.read().unwrap().accessors.as_ref().unwrap()[0].clone();
    accessor.write().unwrap().count = 2.0;
    assert_eq!(
        read_gltf_accessor(&reader, 0, None)
            .fault
            .unwrap()
            .read()
            .unwrap()
            .kind,
        "gltf.accessor-invalid-read"
    );
    accessor.write().unwrap().count = 1.0;
    accessor.write().unwrap().byte_offset = Some(-4.0);
    assert_eq!(
        read_gltf_accessor(&reader, 0, None)
            .fault
            .unwrap()
            .read()
            .unwrap()
            .kind,
        "gltf.accessor-invalid-read"
    );
}

#[test]
fn de_strides_interleaved_attributes_and_accepts_zero_only_as_tight_stride() {
    let reader = accessor_reader(
        json!({"accessors":[{"bufferView":0,"componentType":5126,"count":2,"type":"VEC3"},{"bufferView":0,"byteOffset":12,"componentType":5126,"count":2,"type":"VEC3"}],"bufferViews":[{"buffer":0,"byteLength":48,"byteStride":24}]}),
        f32_bytes(&[1.0, 2.0, 3.0, 0.0, 0.0, 1.0, 4.0, 5.0, 6.0, 0.0, 1.0, 0.0]),
        1,
        0,
    );
    assert_eq!(
        float_values(&read_gltf_accessor(&reader, 0, Some("VEC3"))),
        [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
    );
    assert_eq!(
        float_values(&read_gltf_accessor(&reader, 1, Some("VEC3"))),
        [0.0, 0.0, 1.0, 0.0, 1.0, 0.0]
    );
    let view = reader.source.read().unwrap().buffer_views.as_ref().unwrap()[0].clone();
    view.write().unwrap().byte_stride = Some(0.0);
    assert_eq!(
        float_values(&read_gltf_accessor(&reader, 0, None)),
        [1.0, 2.0, 3.0, 0.0, 0.0, 1.0]
    );
    for stride in [4.0, -1.0, 12.5, f32::NAN, f32::INFINITY] {
        view.write().unwrap().byte_stride = Some(stride);
        assert_eq!(
            read_gltf_accessor(&reader, 0, None)
                .fault
                .unwrap()
                .read()
                .unwrap()
                .kind,
            "gltf.accessor-invalid-read"
        );
    }
}

#[test]
fn keeps_uint32_components_exact_and_preserves_all_native_array_kinds() {
    let cases = [
        (5120, vec![0x80, 0x7f]),
        (5121, vec![0, 255]),
        (
            5122,
            [-32768_i16, 32767]
                .iter()
                .flat_map(|value| value.to_le_bytes())
                .collect(),
        ),
        (
            5123,
            [0_u16, 65535]
                .iter()
                .flat_map(|value| value.to_le_bytes())
                .collect(),
        ),
        (
            5125,
            [16777217_u32, u32::MAX]
                .iter()
                .flat_map(|value| value.to_le_bytes())
                .collect(),
        ),
        (5126, f32_bytes(&[0.5, -1.0])),
    ];
    for (kind, bytes) in cases {
        let length = bytes.len();
        let reader = accessor_reader(
            json!({"accessors":[{"bufferView":0,"componentType":kind,"count":2,"type":"SCALAR"}],"bufferViews":[{"buffer":0,"byteLength":length}]}),
            bytes,
            3,
            0,
        );
        let result = read_gltf_accessor(&reader, 0, Some("SCALAR"));
        assert_eq!(result.count, 2);
        assert!(result.fault.is_none());
        match result.data {
            GltfComponentArray::Int8(data) => {
                assert_eq!(&**data.values.read().unwrap(), &[-128, 127])
            }
            GltfComponentArray::Uint8(data) => {
                assert_eq!(&**data.values.read().unwrap(), &[0, 255])
            }
            GltfComponentArray::Int16(data) => {
                assert_eq!(&**data.values.read().unwrap(), &[-32768, 32767])
            }
            GltfComponentArray::Uint16(data) => {
                assert_eq!(&**data.values.read().unwrap(), &[0, 65535])
            }
            GltfComponentArray::Uint32(data) => {
                assert_eq!(&**data.values.read().unwrap(), &[16777217, u32::MAX])
            }
            GltfComponentArray::Float32(data) => {
                assert_eq!(&**data.values.read().unwrap(), &[0.5, -1.0])
            }
        }
    }
}

#[test]
fn normalizes_each_integer_width_and_keeps_float_normalized_flag_as_a_no_op() {
    let cases = [
        (5120, vec![0x80, 0, 127], vec![-1.0, 0.0, 1.0]),
        (5121, vec![0, 128, 255], vec![0.0, 128.0 / 255.0, 1.0]),
        (
            5122,
            [-32768_i16, 0, 32767]
                .iter()
                .flat_map(|value| value.to_le_bytes())
                .collect(),
            vec![-1.0, 0.0, 1.0],
        ),
        (
            5123,
            [0_u16, 32768, 65535]
                .iter()
                .flat_map(|value| value.to_le_bytes())
                .collect(),
            vec![0.0, 32768.0 / 65535.0, 1.0],
        ),
        (
            5125,
            [0_u32, 2147483648, u32::MAX]
                .iter()
                .flat_map(|value| value.to_le_bytes())
                .collect(),
            vec![0.0, 0.5, 1.0],
        ),
        (5126, f32_bytes(&[2.0, 0.0, -2.0]), vec![2.0, 0.0, -2.0]),
    ];
    for (kind, bytes, expected) in cases {
        let length = bytes.len();
        let reader = accessor_reader(
            json!({"accessors":[{"bufferView":0,"componentType":kind,"normalized":true,"count":1,"type":"VEC3"}],"bufferViews":[{"buffer":0,"byteLength":length}]}),
            bytes,
            1,
            0,
        );
        let result = read_gltf_accessor(&reader, 0, Some("VEC3"));
        assert!(result.fault.is_none());
        for (actual, expected) in float_values(&result).iter().zip(expected) {
            // D1 f32 bound (TS: 0)
            assert!((actual - expected).abs() <= 4.0 * f32::EPSILON * expected.abs().max(1.0));
        }
    }
}

#[test]
fn rejects_original_fractional_json_byte_quantities_before_f32_rounding() {
    for (field, value) in [
        ("count", json!(0.9999999999)),
        ("byteOffset", json!(0.9999999999)),
        ("componentType", json!(5125.9999999999)),
    ] {
        let mut source = json!({"accessors":[{"bufferView":0,"componentType":5126,"count":1,"type":"VEC3"}],"bufferViews":[{"buffer":0,"byteLength":12}]});
        source["accessors"][0][field] = value;
        let reader = accessor_reader(source, f32_bytes(&[1.0, 2.0, 3.0]), 0, 0);
        assert_eq!(
            read_gltf_accessor(&reader, 0, None)
                .fault
                .unwrap()
                .read()
                .unwrap()
                .kind,
            "gltf.accessor-invalid-read"
        );
    }
    for field in ["byteOffset", "byteLength", "byteStride"] {
        let mut source = json!({"accessors":[{"bufferView":0,"componentType":5126,"count":1,"type":"VEC3"}],"bufferViews":[{"buffer":0,"byteLength":12}]});
        source["bufferViews"][0][field] = json!(11.9999999999);
        let reader = accessor_reader(source, f32_bytes(&[1.0, 2.0, 3.0]), 0, 0);
        assert_eq!(
            read_gltf_accessor(&reader, 0, None)
                .fault
                .unwrap()
                .read()
                .unwrap()
                .kind,
            "gltf.accessor-invalid-read"
        );
    }
}

#[test]
fn reports_faults_to_the_callers_role_and_checks_expected_type_before_invalid_geometry() {
    let reader = accessor_reader(
        json!({"accessors":[{"componentType":9999,"count":-1,"type":"VEC2"}]}),
        Vec::new(),
        0,
        0,
    );
    let wrong_type = read_gltf_accessor(&reader, 0, Some("VEC3"));
    assert_eq!(
        wrong_type.fault.unwrap().read().unwrap().kind,
        "gltf.accessor-type-mismatch"
    );
    assert_eq!(
        read_gltf_accessor(&reader, 0, None)
            .fault
            .unwrap()
            .read()
            .unwrap()
            .kind,
        "gltf.accessor-invalid-read"
    );
    let missing = read_gltf_accessor(&reader, 99, None);
    assert_eq!(missing.count, 0);
    assert!(float_values(&missing).is_empty());
    assert!(reader.drops.as_ref().unwrap().read().unwrap().is_empty());
    report_gltf_accessor_fault(
        reader.drops.as_ref(),
        ImportDiagnosticSeverity::Recover,
        missing.fault.as_ref().unwrap(),
    );
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    flush_gltf_drops(Some(&diagnostics), reader.drops.as_ref());
    let diagnostics = diagnostics.read().unwrap();
    assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
    assert_eq!(diagnostics[0].kind, "gltf.accessor-not-found");
    assert_eq!(
        diagnostics[0].detail.as_ref().unwrap()["firstAccessor"],
        ImportDiagnosticDetailValue::Number(99.0)
    );
}

#[test]
fn sparse_overrides_zero_fill_without_a_base_view_and_apply_duplicate_destinations_in_order() {
    let mut payload = vec![1, 1];
    payload.extend(f32_bytes(&[4.0, 5.0, 6.0, 9.0, 9.0, 9.0]));
    let reader = accessor_reader(
        json!({"accessors":[{"componentType":5126,"count":3,"type":"VEC3","sparse":{"count":2,"indices":{"bufferView":0,"componentType":5121},"values":{"bufferView":1}}}],"bufferViews":[{"buffer":0,"byteLength":2},{"buffer":0,"byteOffset":2,"byteLength":24}]}),
        payload,
        5,
        0,
    );
    let result = read_gltf_accessor(&reader, 0, Some("VEC3"));
    assert_eq!(
        float_values(&result),
        [0.0, 0.0, 0.0, 9.0, 9.0, 9.0, 0.0, 0.0, 0.0]
    );
    assert!(reader.drops.as_ref().unwrap().read().unwrap().is_empty());
}

#[test]
fn sparse_prescan_keeps_the_entire_base_when_a_later_destination_is_out_of_range() {
    let mut payload = f32_bytes(&[1.0, 2.0, 3.0]);
    payload.extend([0, 99]);
    payload.extend(f32_bytes(&[8.0, 9.0]));
    let reader = accessor_reader(
        json!({"accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"SCALAR","sparse":{"count":2,"indices":{"bufferView":1,"componentType":5121},"values":{"bufferView":2}}}],"bufferViews":[{"buffer":0,"byteLength":12},{"buffer":0,"byteOffset":12,"byteLength":2},{"buffer":0,"byteOffset":14,"byteLength":8}]}),
        payload,
        3,
        0,
    );
    let result = read_gltf_accessor(&reader, 0, None);
    assert_eq!(float_values(&result), [1.0, 2.0, 3.0]);
    assert!(result.fault.is_none());
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    flush_gltf_drops(Some(&diagnostics), reader.drops.as_ref());
    let diagnostics = diagnostics.read().unwrap();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].kind, "gltf.sparse-index-out-of-range");
    assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
    assert_eq!(
        diagnostics[0].detail.as_ref().unwrap()["firstIndex"],
        ImportDiagnosticDetailValue::Number(99.0)
    );
}

#[test]
fn sparse_rejects_any_declared_stride_and_bad_lower_windows_without_losing_base_values() {
    let mut payload = f32_bytes(&[1.0, 2.0, 3.0]);
    payload.push(1);
    payload.extend(f32_bytes(&[9.0]));
    let reader = accessor_reader(
        json!({"accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"SCALAR","sparse":{"count":1,"indices":{"bufferView":1,"componentType":5121},"values":{"bufferView":2}}}],"bufferViews":[{"buffer":0,"byteLength":12},{"buffer":0,"byteOffset":12,"byteLength":1,"byteStride":0},{"buffer":0,"byteOffset":13,"byteLength":4}]}),
        payload,
        0,
        0,
    );
    assert_eq!(
        float_values(&read_gltf_accessor(&reader, 0, None)),
        [1.0, 2.0, 3.0]
    );
    let views = reader
        .source
        .read()
        .unwrap()
        .buffer_views
        .as_ref()
        .unwrap()
        .clone();
    views[1].write().unwrap().byte_stride = None;
    let sparse = reader.source.read().unwrap().accessors.as_ref().unwrap()[0]
        .read()
        .unwrap()
        .sparse
        .clone()
        .unwrap();
    sparse.read().unwrap().values.write().unwrap().byte_offset = Some(-4.0);
    assert_eq!(
        float_values(&read_gltf_accessor(&reader, 0, None)),
        [1.0, 2.0, 3.0]
    );
    let tallies = reader.drops.as_ref().unwrap().read().unwrap();
    assert_eq!(tallies.len(), 1);
    assert_eq!(tallies[0].kind, "gltf.sparse-invalid-read");
    assert_eq!(tallies[0].count, 2);
}

#[test]
fn zero_count_reads_end_at_the_start_and_matrix_shapes_use_source_component_counts() {
    for (kind, width) in [
        ("SCALAR", 1),
        ("VEC2", 2),
        ("VEC3", 3),
        ("VEC4", 4),
        ("MAT2", 4),
        ("MAT3", 9),
        ("MAT4", 16),
    ] {
        let reader = accessor_reader(
            json!({"accessors":[{"bufferView":0,"componentType":5121,"count":1,"type":kind},{"bufferView":0,"byteOffset":width,"componentType":5121,"count":0,"type":kind}],"bufferViews":[{"buffer":0,"byteLength":width}]}),
            vec![7; width],
            1,
            0,
        );
        let result = read_gltf_accessor(&reader, 0, None);
        let GltfComponentArray::Uint8(data) = result.data else {
            panic!("expected Uint8Array")
        };
        assert_eq!(data.values.read().unwrap().len(), width);
        let empty = read_gltf_accessor(&reader, 1, None);
        assert!(empty.fault.is_none());
        assert_eq!(empty.count, 0);
    }
}
