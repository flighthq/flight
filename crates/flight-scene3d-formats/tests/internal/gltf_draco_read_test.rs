use super::*;
use crate::gltf_draco::{GltfDracoRegistry, unregister_gltf_draco_decoder};
use crate::gltf_json::decode_gltf_json;
use crate::gltf_types::GltfDracoDecoder;
use flight_buffer::{
    create_array_buffer_from_bytes, create_array_buffer_view, equals_array_buffer,
    get_array_buffer_storage,
};
use flight_entity::set_record_value;
use serde_json::json;
use std::sync::{Arc, RwLock};

fn draco_reader() -> (Arc<GltfAccessorReader>, Ref<GltfPrimitive>) {
    let parsed = decode_gltf_json(
        &json!({"bufferViews":[{"buffer":0,"byteOffset":1,"byteLength":3}],"meshes":[{"primitives":[{"attributes":{"POSITION":0},"extensions":{"KHR_draco_mesh_compression":{"bufferView":0,"attributes":{"POSITION":7}}}}]}]}),
    );
    let primitive = parsed.source.read().unwrap().meshes.as_ref().unwrap()[0]
        .read()
        .unwrap()
        .primitives[0]
        .clone();
    let backing =
        create_array_buffer_from_bytes(vec![0xa5, 0xee, 9, 8, 7, 0xff, 0x5a].into_boxed_slice());
    return (
        Arc::new(GltfAccessorReader {
            buffers: vec![
                create_array_buffer_view(&backing, 1, 5, ArrayBufferViewKind::Uint8Array).unwrap(),
            ],
            source: parsed.source,
            metadata: parsed.metadata,
            drops: Some(Arc::new(RwLock::new(Vec::new()))),
        }),
        primitive,
    );
}

#[test]
fn decoder_retains_original_payload_backing_attribute_handle_and_result_and_can_reenter_all_parser_state()
 {
    let (reader, primitive) = draco_reader();
    let block = primitive
        .read()
        .unwrap()
        .extensions
        .as_ref()
        .unwrap()
        .read()
        .unwrap()
        .khr_draco_mesh_compression
        .clone()
        .unwrap();
    let ids = block.read().unwrap().attributes.clone();
    let constructor: fn() -> flight_entity::Record<Ref<Box<[f32]>>> = Default::default;
    let mesh = Arc::new(RwLock::new(GltfDracoMesh {
        attributes: Arc::new(RwLock::new(constructor())),
        indices: None,
        vertex_count: 3,
    }));
    let registry = Arc::new(RwLock::new(GltfDracoRegistry { decoder: None }));
    let original_reader = reader.clone();
    let original_ids = ids.clone();
    let original_mesh = mesh.clone();
    let original_registry = registry.clone();
    let decoder: GltfDracoDecoder = Arc::new(move |payload, attributes| {
        assert!(equals_array_buffer(
            &payload.buffer,
            &original_reader.buffers[0].buffer
        ));
        assert_eq!(payload.byte_offset, 2);
        assert_eq!(payload.byte_length, 3);
        let storage = get_array_buffer_storage(&payload.buffer);
        assert_eq!(&storage.read().unwrap()[2..5], &[9, 8, 7]);
        storage.try_write().unwrap()[2] = 99;
        assert!(Arc::ptr_eq(attributes, &original_ids));
        set_record_value(
            &mut attributes.try_write().unwrap(),
            "POSITION".to_string(),
            8.0,
        );
        assert!(original_reader.source.try_write().is_ok());
        assert!(original_reader.drops.as_ref().unwrap().try_write().is_ok());
        unregister_gltf_draco_decoder(&mut original_registry.try_write().unwrap());
        return Some(original_mesh.clone());
    });
    registry.write().unwrap().decoder = Some(decoder);
    let options = GltfImportOptions {
        base_path: None,
        extension_handlers: None,
        external_buffers: None,
        draco_registry: Some(registry.clone()),
    };
    let decoded = resolve_gltf_draco_mesh(&reader, &primitive, Some(&options)).unwrap();
    assert!(Arc::ptr_eq(&decoded, &mesh));
    assert!(registry.read().unwrap().decoder.is_none());
    assert_eq!(
        get_array_buffer_storage(&reader.buffers[0].buffer)
            .read()
            .unwrap()[2],
        99
    );
    assert!(reader.drops.as_ref().unwrap().read().unwrap().is_empty());
}

#[test]
fn decoder_null_and_throw_are_contained_and_aggregated_as_failed_decode_drops() {
    let (reader, primitive) = draco_reader();
    let registry = Arc::new(RwLock::new(GltfDracoRegistry {
        decoder: Some(Arc::new(|_, _| None)),
    }));
    let options = GltfImportOptions {
        base_path: None,
        extension_handlers: None,
        external_buffers: None,
        draco_registry: Some(registry.clone()),
    };
    assert!(resolve_gltf_draco_mesh(&reader, &primitive, Some(&options)).is_none());
    registry.write().unwrap().decoder = Some(Arc::new(|_, _| panic!("broken compressed payload")));
    assert!(resolve_gltf_draco_mesh(&reader, &primitive, Some(&options)).is_none());
    let drops = reader.drops.as_ref().unwrap().read().unwrap();
    assert_eq!(drops.len(), 1);
    assert_eq!(drops[0].kind, "gltf.draco-decode-failed");
    assert_eq!(drops[0].severity, ImportDiagnosticSeverity::Drop);
    assert_eq!(drops[0].count, 2);
}

#[test]
fn decoder_missing_and_payload_missing_remain_distinct_from_uncompressed_primitives() {
    let (reader, primitive) = draco_reader();
    assert!(resolve_gltf_draco_mesh(&reader, &primitive, None).is_none());
    let options = GltfImportOptions {
        base_path: None,
        extension_handlers: None,
        external_buffers: None,
        draco_registry: Some(Arc::new(RwLock::new(GltfDracoRegistry {
            decoder: Some(Arc::new(|_, _| {
                panic!("missing payload must not invoke decoder")
            })),
        }))),
    };
    reader.source.write().unwrap().buffer_views = None;
    assert!(resolve_gltf_draco_mesh(&reader, &primitive, Some(&options)).is_none());
    primitive.write().unwrap().extensions = None;
    assert!(resolve_gltf_draco_mesh(&reader, &primitive, Some(&options)).is_none());
    let drops = reader.drops.as_ref().unwrap().read().unwrap();
    assert_eq!(drops.len(), 2);
    assert_eq!(drops[0].kind, "gltf.draco-decoder-missing");
    assert_eq!(drops[1].kind, "gltf.draco-payload-missing");
}
