use super::*;
use crate::gltf_buffer::gltf_owned_byte_view;
use crate::gltf_draco::GltfDracoRegistry;
use crate::gltf_json::decode_gltf_json;
use flight_entity::set_record_value;
use serde_json::{Value, json};
use std::sync::atomic::{AtomicUsize, Ordering};

#[test]
fn morph_keeps_original_target_and_weight_identity_and_recovers_optional_normal_without_losing_tangent_deltas()
 {
    let bytes: Vec<_> = [1.0_f32, 2.0, 3.0, 4.0, 5.0, 6.0]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
    let (reader, primitive) = geometry_reader(
        json!({"accessors":[{"bufferView":0,"componentType":5126,"count":2,"type":"VEC3"}],"bufferViews":[{"buffer":0,"byteLength":24}],"meshes":[{"primitives":[{"attributes":{"POSITION":0},"targets":[{"POSITION":0,"NORMAL":99,"TANGENT":0},{"POSITION":0}]}]}]}),
        bytes,
    );
    let morph = build_gltf_morph(&reader, &primitive, Some(&[0.25, 0.75, 1.0]), 2).unwrap();
    let morph = morph.read().unwrap();
    assert_eq!(&*morph.weights, &[0.25, 0.75]);
    assert_eq!(morph.targets.len(), 2);
    assert!(morph.targets[0].normal_deltas.is_none());
    assert_eq!(
        morph.targets[0].tangent_deltas.as_deref(),
        Some(&[1.0, 2.0, 3.0, 4.0, 5.0, 6.0][..])
    );
    assert_eq!(
        &*morph.targets[1].position_deltas,
        &[1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
    );
    assert_eq!(
        reader.drops.as_ref().unwrap().read().unwrap()[0].kind,
        "gltf.accessor-not-found"
    );
    assert_eq!(
        reader.drops.as_ref().unwrap().read().unwrap()[0].severity,
        ImportDiagnosticSeverity::Recover
    );
}

#[test]
fn invalid_later_morph_target_drops_the_whole_set_without_renumbering_survivors_or_reporting_a_subsumed_accessor_recovery()
 {
    let bytes: Vec<_> = [1.0_f32, 2.0, 3.0]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
    let (reader, primitive) = geometry_reader(
        json!({"accessors":[{"bufferView":0,"componentType":5126,"count":1,"type":"VEC3"}],"bufferViews":[{"buffer":0,"byteLength":12}],"meshes":[{"primitives":[{"attributes":{"POSITION":0},"targets":[{"POSITION":0},{"POSITION":99}]}]}]}),
        bytes,
    );
    assert!(build_gltf_morph(&reader, &primitive, Some(&[0.5, 0.5]), 1).is_none());
    let drops = reader.drops.as_ref().unwrap().read().unwrap();
    assert_eq!(drops.len(), 1);
    assert_eq!(drops[0].kind, "gltf.morph-target-no-position");
    assert_eq!(drops[0].severity, ImportDiagnosticSeverity::Drop);
    drop(drops);
    reader.drops.as_ref().unwrap().write().unwrap().clear();
    assert!(build_gltf_morph(&reader, &primitive, None, 2).is_none());
    assert_eq!(
        reader.drops.as_ref().unwrap().read().unwrap()[0].kind,
        "gltf.morph-target-count-mismatch"
    );
}

fn geometry_reader(source: Value, bytes: Vec<u8>) -> (GltfAccessorReader, Ref<GltfPrimitive>) {
    let parsed = decode_gltf_json(&source);
    let primitive = parsed.source.read().unwrap().meshes.as_ref().unwrap()[0]
        .read()
        .unwrap()
        .primitives[0]
        .clone();
    return (
        GltfAccessorReader {
            source: parsed.source,
            metadata: parsed.metadata,
            buffers: vec![gltf_owned_byte_view(bytes.into_boxed_slice())],
            drops: Some(Arc::new(RwLock::new(Vec::new()))),
        },
        primitive,
    );
}

#[test]
fn triangle_generation_uses_canonical_flat_normals_and_optional_faults_keep_finite_geometry() {
    let positions = [0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
    let (reader, primitive) = geometry_reader(
        json!({"accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"}],"bufferViews":[{"buffer":0,"byteLength":36}],"meshes":[{"primitives":[{"attributes":{"POSITION":0,"NORMAL":99}}]}]}),
        positions
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect(),
    );
    let geometry = primitive_gltf_to_geometry(&reader, &primitive, None).unwrap();
    let geometry = geometry.read().unwrap();
    assert_eq!(geometry.topology, PrimitiveTopology::TriangleList);
    assert_eq!(geometry.vertices.len(), 36);
    assert!(geometry.vertices.iter().all(|value| value.is_finite()));
    for vertex in geometry.vertices.chunks_exact(12) {
        assert_eq!(&vertex[3..6], &[0.0, 0.0, 1.0]);
    }
    assert_eq!(
        reader.drops.as_ref().unwrap().read().unwrap()[0].kind,
        "gltf.accessor-not-found"
    );
    assert_eq!(
        reader.drops.as_ref().unwrap().read().unwrap()[0].severity,
        ImportDiagnosticSeverity::Recover
    );
}

#[test]
fn topology_expansion_closes_line_loops_and_fans_without_changing_source_uint32_indices() {
    let positions = [
        0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0,
    ];
    let mut bytes: Vec<_> = positions
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
    bytes.extend(
        [16777217_u32, u32::MAX]
            .iter()
            .flat_map(|value| value.to_le_bytes()),
    );
    let (reader, primitive) = geometry_reader(
        json!({"accessors":[{"bufferView":0,"componentType":5126,"count":4,"type":"VEC3"},{"bufferView":1,"componentType":5125,"count":2,"type":"SCALAR"}],"bufferViews":[{"buffer":0,"byteLength":48},{"buffer":0,"byteOffset":48,"byteLength":8}],"meshes":[{"primitives":[{"attributes":{"POSITION":0},"mode":0,"indices":1}]}]}),
        bytes,
    );
    let geometry = primitive_gltf_to_geometry(&reader, &primitive, None).unwrap();
    let geometry = geometry.read().unwrap();
    let IndexBuffer::U32(indices) = &geometry.indices else {
        panic!("expected uint32 indices")
    };
    assert_eq!(&**indices.data.read().unwrap(), &[16777217, u32::MAX]);
    primitive.write().unwrap().indices = None;
    for (mode, expected, topology) in [
        (
            2.0,
            vec![0, 1, 1, 2, 2, 3, 3, 0],
            PrimitiveTopology::LineList,
        ),
        (6.0, vec![0, 1, 2, 0, 2, 3], PrimitiveTopology::TriangleList),
    ] {
        primitive.write().unwrap().mode = Some(mode);
        let elements = build_gltf_primitive_elements(&reader, &primitive, None, 4).unwrap();
        assert_eq!(elements.indices.unwrap().as_ref(), expected);
        assert_eq!(elements.topology, topology);
    }
    primitive.write().unwrap().mode = Some(99.0);
    assert!(primitive_gltf_to_geometry(&reader, &primitive, None).is_none());
    assert_eq!(
        reader.drops.as_ref().unwrap().read().unwrap()[0].kind,
        "gltf.primitive-unsupported-mode"
    );
}

#[test]
fn skinned_layout_renormalizes_weights_and_keeps_joint_channels_at_source_slots() {
    let mut bytes: Vec<_> = [1.0_f32, 2.0, 3.0]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
    bytes.extend([1, 2, 3, 4, 1, 1, 0, 0]);
    let (reader, primitive) = geometry_reader(
        json!({"accessors":[{"bufferView":0,"componentType":5126,"count":1,"type":"VEC3"},{"bufferView":1,"componentType":5121,"count":1,"type":"VEC4"},{"bufferView":2,"componentType":5121,"normalized":true,"count":1,"type":"VEC4"}],"bufferViews":[{"buffer":0,"byteLength":12},{"buffer":0,"byteOffset":12,"byteLength":4},{"buffer":0,"byteOffset":16,"byteLength":4}],"meshes":[{"primitives":[{"attributes":{"POSITION":0,"JOINTS_0":1,"WEIGHTS_0":2},"mode":0}]}]}),
        bytes,
    );
    let geometry = primitive_gltf_to_geometry(&reader, &primitive, None).unwrap();
    let geometry = geometry.read().unwrap();
    assert_eq!(geometry.layout.read().unwrap().stride, 80);
    assert_eq!(geometry.vertices.len(), 20);
    assert_eq!(&geometry.vertices[12..16], &[1.0, 2.0, 3.0, 4.0]);
    for (actual, expected) in geometry.vertices[16..20]
        .iter()
        .zip([0.5_f32, 0.5, 0.0, 0.0])
    {
        // D1 f32 bound (TS: 0)
        assert!((actual - expected).abs() <= 4.0 * f32::EPSILON);
    }
}

#[test]
fn compressed_primitive_decodes_once_and_uses_actual_decoder_vertex_count_without_reading_missing_accessor_views()
 {
    let (reader, primitive) = geometry_reader(
        json!({"accessors":[{"componentType":5126,"count":99,"type":"VEC3"}],"bufferViews":[{"buffer":0,"byteLength":3}],"meshes":[{"primitives":[{"attributes":{"POSITION":0},"mode":0,"extensions":{"KHR_draco_mesh_compression":{"bufferView":0,"attributes":{"POSITION":7}}}}]}]}),
        vec![1, 2, 3],
    );
    let constructor: fn() -> flight_entity::Record<Ref<Box<[f32]>>> = Default::default;
    let mut attributes = constructor();
    set_record_value(
        &mut attributes,
        "POSITION".to_string(),
        Arc::new(RwLock::new(vec![1.0, 2.0, 3.0].into_boxed_slice())),
    );
    let decoded = Arc::new(RwLock::new(GltfDracoMesh {
        attributes: Arc::new(RwLock::new(attributes)),
        indices: None,
        vertex_count: 1,
    }));
    let calls = Arc::new(AtomicUsize::new(0));
    let counter = calls.clone();
    let registry = Arc::new(RwLock::new(GltfDracoRegistry {
        decoder: Some(Arc::new(move |_, _| {
            counter.fetch_add(1, Ordering::SeqCst);
            return Some(decoded.clone());
        })),
    }));
    let options = GltfImportOptions {
        base_path: None,
        extension_handlers: None,
        external_buffers: None,
        draco_registry: Some(registry),
    };
    let geometry = primitive_gltf_to_geometry(&reader, &primitive, Some(&options)).unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    assert_eq!(geometry.read().unwrap().vertices.len(), 12);
    assert_eq!(&geometry.read().unwrap().vertices[0..3], &[1.0, 2.0, 3.0]);
    assert!(reader.drops.as_ref().unwrap().read().unwrap().is_empty());
}
