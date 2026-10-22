use crate::gltf_test_helper::{gltf_data_uri, minimal_gltf_document};
use flight_buffer::{
    ArrayBufferView, ArrayBufferViewKind, create_array_buffer_from_bytes, create_array_buffer_view,
    get_array_buffer_storage,
};
use flight_entity::{Float32Array, Record, Ref, set_record_value};
use flight_geometry::create_vector3;
use flight_importdiagnostics::ImportDiagnosticSeverity;
use flight_meshgeometry::{
    get_mesh_geometry_index_count, get_mesh_geometry_vertex_count,
    get_mesh_geometry_vertex_position,
};
use flight_scene3d_formats::contract::*;
use std::sync::{Arc, RwLock};

struct SeenDraco {
    attribute_ids: Option<Record<f32>>,
    bytes: Vec<u8>,
}

mod get_gltf_draco_decoder {
    use super::*;

    #[test]
    fn imports_a_compressed_primitive_through_the_registered_decoder() {
        let registry = Arc::new(RwLock::new(GltfDracoRegistry { decoder: None }));
        register_gltf_draco_decoder(
            &mut registry.write().unwrap(),
            stub_decoder(triangle(), None),
        );
        let source = draco_gltf(&[1, 2, 3, 4]);
        let document = parse_gltf(
            &GltfSource::Document(GltfDocumentSource { source: &source }),
            None,
            Some(&draco_options(&registry)),
        );
        assert_eq!(document.read().unwrap().meshes.len(), 1);
        let geometry = document.read().unwrap().meshes[0].geometry.clone();
        let geometry = geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 3);
        assert_eq!(get_mesh_geometry_index_count(&geometry), 3);
        let mut position = create_vector3(0.0, 0.0, 0.0);
        assert!(get_mesh_geometry_vertex_position(
            &mut position,
            &geometry,
            1
        ));
        // D1 f32 bound (TS: 0.000005)
        assert!((position.x as f64 - 1.0).abs() <= 0.000005_f64.max(4.0 * f32::EPSILON as f64));
    }

    #[test]
    fn hands_the_decoder_the_payload_bytes_and_the_extensions_attribute_ids() {
        let registry = Arc::new(RwLock::new(GltfDracoRegistry { decoder: None }));
        let seen = Arc::new(RwLock::new(SeenDraco {
            attribute_ids: None,
            bytes: Vec::new(),
        }));
        register_gltf_draco_decoder(
            &mut registry.write().unwrap(),
            stub_decoder(triangle(), Some(seen.clone())),
        );
        let source = draco_gltf(&[9, 8, 7]);
        parse_gltf(
            &GltfSource::Document(GltfDocumentSource { source: &source }),
            None,
            Some(&draco_options(&registry)),
        );
        let seen = seen.read().unwrap();
        assert_eq!(seen.bytes, [9, 8, 7]);
        let ids = seen.attribute_ids.as_ref().unwrap();
        let mut keys = Vec::new();
        flight_entity::get_record_keys(&mut keys, ids);
        assert_eq!(keys, ["NORMAL", "POSITION"]);
        assert_eq!(flight_entity::get_record_value(ids, "NORMAL"), Some(&1.0));
        assert_eq!(flight_entity::get_record_value(ids, "POSITION"), Some(&0.0));
    }

    #[test]
    fn reports_a_missing_decoder_rather_than_a_bogus_accessor_fault() {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let source = draco_gltf(&[1, 2, 3]);
        parse_gltf(
            &GltfSource::Document(GltfDocumentSource { source: &source }),
            Some(&diagnostics),
            None,
        );
        let diagnostics = diagnostics.read().unwrap();
        let crumb = diagnostics
            .iter()
            .find(|diagnostic| diagnostic.kind == "gltf.draco-decoder-missing")
            .unwrap();
        assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
        assert!(
            !diagnostics
                .iter()
                .any(|diagnostic| diagnostic.kind == "gltf.accessor-bufferview-not-found")
        );
    }

    #[test]
    fn contains_a_throwing_decoder_rather_than_letting_it_take_the_import_down() {
        let registry = Arc::new(RwLock::new(GltfDracoRegistry { decoder: None }));
        register_gltf_draco_decoder(
            &mut registry.write().unwrap(),
            Arc::new(|_, _| panic!("corrupt payload")),
        );
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let source = draco_gltf(&[1, 2, 3]);
        let document = parse_gltf(
            &GltfSource::Document(GltfDocumentSource { source: &source }),
            Some(&diagnostics),
            Some(&draco_options(&registry)),
        );
        assert!(document.read().unwrap().meshes.is_empty());
        assert!(
            diagnostics
                .read()
                .unwrap()
                .iter()
                .any(|diagnostic| diagnostic.kind == "gltf.draco-decode-failed")
        );
    }

    #[test]
    fn reports_a_decoder_that_declines_the_payload() {
        let registry = Arc::new(RwLock::new(GltfDracoRegistry { decoder: None }));
        register_gltf_draco_decoder(&mut registry.write().unwrap(), Arc::new(|_, _| None));
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let source = draco_gltf(&[1, 2, 3]);
        parse_gltf(
            &GltfSource::Document(GltfDocumentSource { source: &source }),
            Some(&diagnostics),
            Some(&draco_options(&registry)),
        );
        assert!(
            diagnostics
                .read()
                .unwrap()
                .iter()
                .any(|diagnostic| diagnostic.kind == "gltf.draco-decode-failed")
        );
    }

    #[test]
    fn returns_the_original_synchronous_callback_and_its_original_mesh_and_attribute_records() {
        let mesh = triangle();
        let attributes = Arc::new(RwLock::new(empty_record()));
        set_record_value(&mut attributes.write().unwrap(), "NORMAL".to_string(), 1.0);
        set_record_value(
            &mut attributes.write().unwrap(),
            "POSITION".to_string(),
            0.0,
        );
        let original_ids = attributes.clone();
        let original_mesh = mesh.clone();
        let decoder: GltfDracoDecoder =
            Arc::new(move |bytes: &ArrayBufferView, ids: &Ref<Record<f32>>| {
                assert_eq!(
                    &get_array_buffer_storage(&bytes.buffer).read().unwrap()
                        [bytes.byte_offset..bytes.byte_offset + bytes.byte_length],
                    [9, 8, 7]
                );
                assert!(Arc::ptr_eq(ids, &original_ids));
                return Some(original_mesh.clone());
            });
        let mut registry = GltfDracoRegistry { decoder: None };
        register_gltf_draco_decoder(&mut registry, decoder.clone());
        let found = get_gltf_draco_decoder(&registry).unwrap();
        assert!(Arc::ptr_eq(&found, &decoder));
        let backing = create_array_buffer_from_bytes(vec![0xa5, 9, 8, 7, 0xee].into_boxed_slice());
        let payload =
            create_array_buffer_view(&backing, 1, 3, ArrayBufferViewKind::Uint8Array).unwrap();
        let result = found(&payload, &attributes).unwrap();
        assert!(Arc::ptr_eq(&result, &mesh));
        assert!(Arc::ptr_eq(
            &result.read().unwrap().attributes,
            &mesh.read().unwrap().attributes
        ));
        unregister_gltf_draco_decoder(&mut registry);
        assert!(get_gltf_draco_decoder(&registry).is_none());
        assert!(Arc::ptr_eq(&found(&payload, &attributes).unwrap(), &mesh));
    }
}

mod has_gltf_draco_decoder {
    use super::*;

    #[test]
    fn makes_the_required_extension_answer_a_runtime_fact() {
        let source = draco_gltf(&[1, 2, 3]);
        source.write().unwrap().extensions_required =
            Some(vec!["KHR_draco_mesh_compression".to_string()]);
        let registry = Arc::new(RwLock::new(GltfDracoRegistry { decoder: None }));
        let without = Arc::new(RwLock::new(Vec::new()));
        parse_gltf(
            &GltfSource::Document(GltfDocumentSource { source: &source }),
            Some(&without),
            Some(&draco_options(&registry)),
        );
        assert!(
            without
                .read()
                .unwrap()
                .iter()
                .any(|diagnostic| diagnostic.kind == "gltf.unsupported-required-extension")
        );
        register_gltf_draco_decoder(
            &mut registry.write().unwrap(),
            stub_decoder(triangle(), None),
        );
        let with = Arc::new(RwLock::new(Vec::new()));
        parse_gltf(
            &GltfSource::Document(GltfDocumentSource { source: &source }),
            Some(&with),
            Some(&draco_options(&registry)),
        );
        assert!(
            !with
                .read()
                .unwrap()
                .iter()
                .any(|diagnostic| diagnostic.kind == "gltf.unsupported-required-extension")
        );
    }

    #[test]
    fn reports_readiness_from_each_explicit_registry_without_ambient_state() {
        let mut first = GltfDracoRegistry { decoder: None };
        let second = GltfDracoRegistry { decoder: None };
        assert!(!has_gltf_draco_decoder(&first));
        let decoder: GltfDracoDecoder = Arc::new(|_, _| None);
        register_gltf_draco_decoder(&mut first, decoder);
        assert!(has_gltf_draco_decoder(&first));
        assert!(!has_gltf_draco_decoder(&second));
        unregister_gltf_draco_decoder(&mut first);
        assert!(!has_gltf_draco_decoder(&first));
    }
}

mod register_gltf_draco_decoder {
    use super::*;

    #[test]
    fn starts_empty_so_an_unregistered_consumer_has_no_decoder() {
        let registry = GltfDracoRegistry { decoder: None };
        assert!(!has_gltf_draco_decoder(&registry));
        assert!(get_gltf_draco_decoder(&registry).is_none());
    }

    #[test]
    fn replaces_the_last_callback_without_copying_or_invoking_it() {
        let first: GltfDracoDecoder = Arc::new(|_, _| None);
        let second: GltfDracoDecoder = Arc::new(|_, _| None);
        let mut registry = GltfDracoRegistry { decoder: None };
        register_gltf_draco_decoder(&mut registry, first.clone());
        register_gltf_draco_decoder(&mut registry, second.clone());
        let found = get_gltf_draco_decoder(&registry).unwrap();
        assert!(Arc::ptr_eq(&found, &second));
        assert!(!Arc::ptr_eq(&found, &first));
    }
}

mod unregister_gltf_draco_decoder {
    use super::*;

    #[test]
    fn returns_the_registry_to_empty_and_preserves_other_registries() {
        let callback: GltfDracoDecoder = Arc::new(|_, _| None);
        let mut first = GltfDracoRegistry { decoder: None };
        let mut second = GltfDracoRegistry { decoder: None };
        register_gltf_draco_decoder(&mut first, callback.clone());
        register_gltf_draco_decoder(&mut second, callback.clone());
        unregister_gltf_draco_decoder(&mut first);
        assert!(!has_gltf_draco_decoder(&first));
        assert!(get_gltf_draco_decoder(&first).is_none());
        assert!(has_gltf_draco_decoder(&second));
        assert!(Arc::ptr_eq(
            &get_gltf_draco_decoder(&second).unwrap(),
            &callback
        ));
    }
}

fn draco_gltf(payload: &[u8]) -> Ref<GltfDocument> {
    let source = minimal_gltf_document();
    let mut ids = empty_record();
    set_record_value(&mut ids, "NORMAL".to_string(), 1.0);
    set_record_value(&mut ids, "POSITION".to_string(), 0.0);
    {
        let mut source = source.write().unwrap();
        source.accessors = Some(vec![
            Arc::new(RwLock::new(GltfAccessor {
                buffer_view: None,
                byte_offset: None,
                component_type: 5126.0,
                count: 3.0,
                normalized: None,
                r#type: "VEC3".to_string(),
                sparse: None,
            })),
            Arc::new(RwLock::new(GltfAccessor {
                buffer_view: None,
                byte_offset: None,
                component_type: 5125.0,
                count: 3.0,
                normalized: None,
                r#type: "SCALAR".to_string(),
                sparse: None,
            })),
        ]);
        source.buffer_views = Some(vec![Arc::new(RwLock::new(GltfBufferView {
            buffer: 0.0,
            byte_length: payload.len() as f32,
            byte_offset: Some(0.0),
            byte_stride: None,
        }))]);
        source.buffers = Some(vec![Arc::new(RwLock::new(GltfBuffer {
            byte_length: payload.len() as f32,
            uri: Some(gltf_data_uri(payload)),
        }))]);
        source.extensions_used = Some(vec!["KHR_draco_mesh_compression".to_string()]);
        source.meshes = Some(vec![Arc::new(RwLock::new(GltfMesh {
            name: None,
            weights: None,
            primitives: vec![Arc::new(RwLock::new(GltfPrimitive {
                attributes: Arc::new(RwLock::new(GltfPrimitiveAttributes {
                    normal: Some(2.0),
                    position: Some(0.0),
                    tangent: None,
                    texcoord_0: None,
                    joints_0: None,
                    weights_0: None,
                })),
                extensions: Some(Arc::new(RwLock::new(GltfPrimitiveExtensions {
                    khr_draco_mesh_compression: Some(Arc::new(RwLock::new(
                        GltfDracoMeshCompression {
                            attributes: Arc::new(RwLock::new(ids)),
                            buffer_view: 0.0,
                        },
                    ))),
                    vendor: empty_record(),
                }))),
                indices: Some(1.0),
                material: None,
                mode: None,
                targets: None,
            }))],
        }))]);
        source.nodes = Some(vec![Arc::new(RwLock::new(GltfNode {
            camera: None,
            name: None,
            children: None,
            mesh: Some(0.0),
            skin: None,
            matrix: None,
            translation: None,
            rotation: None,
            scale: None,
            extensions: None,
        }))]);
        source.scenes = Some(vec![Arc::new(RwLock::new(GltfScene3D {
            name: None,
            nodes: Some(vec![0.0]),
        }))]);
    }
    return source;
}

fn draco_options(registry: &Ref<GltfDracoRegistry>) -> GltfImportOptions {
    return GltfImportOptions {
        base_path: None,
        extension_handlers: None,
        external_buffers: None,
        draco_registry: Some(registry.clone()),
    };
}

fn empty_record<V>() -> Record<V> {
    let constructor: fn() -> Record<V> = Default::default;
    return constructor();
}

fn stub_decoder(mesh: Ref<GltfDracoMesh>, seen: Option<Ref<SeenDraco>>) -> GltfDracoDecoder {
    return Arc::new(move |bytes, attribute_ids| {
        if let Some(seen) = &seen {
            let snapshot = get_array_buffer_storage(&bytes.buffer).read().unwrap()
                [bytes.byte_offset..bytes.byte_offset + bytes.byte_length]
                .to_vec();
            let mut seen = seen.write().unwrap();
            seen.bytes = snapshot;
            seen.attribute_ids = Some(attribute_ids.read().unwrap().clone());
        }
        return Some(mesh.clone());
    });
}

fn triangle() -> Ref<GltfDracoMesh> {
    let mut attributes = empty_record();
    let normals: Box<Float32Array> =
        vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0].into_boxed_slice();
    let positions: Box<Float32Array> =
        vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0].into_boxed_slice();
    set_record_value(
        &mut attributes,
        "NORMAL".to_string(),
        Arc::new(RwLock::new(normals)),
    );
    set_record_value(
        &mut attributes,
        "POSITION".to_string(),
        Arc::new(RwLock::new(positions)),
    );
    return Arc::new(RwLock::new(GltfDracoMesh {
        attributes: Arc::new(RwLock::new(attributes)),
        indices: Some(Arc::new(RwLock::new(vec![0, 1, 2].into_boxed_slice()))),
        vertex_count: 3,
    }));
}
