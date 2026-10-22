use flight_buffer::{
    ArrayBufferView, ArrayBufferViewKind, create_array_buffer_from_bytes, create_array_buffer_view,
    get_array_buffer_storage,
};
use flight_entity::Ref;
use flight_importdiagnostics::{ImportDiagnosticSeverity, report_import_diagnostic};
use flight_node::{NodeRef, get_node_children};
use flight_scene3d::Scene3D;
use flight_scene3d_formats::contract::*;
use flight_texture::TextureColorSpace;
use std::sync::{Arc, RwLock};

const TRIANGLE: &str = r#"{"asset":{"version":"2.0"},"buffers":[{"byteLength":36}],"bufferViews":[{"buffer":0,"byteLength":36}],"accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"}],"meshes":[{"primitives":[{"attributes":{"POSITION":0}}]}],"nodes":[{"mesh":0}],"scenes":[{"nodes":[]},{"nodes":[0]}],"scene":1}"#;

mod create_scene3d_from_glb_with_core_feature_handlers {
    use super::*;

    #[test]
    fn builds_the_authored_default_scene_and_returns_an_empty_scene_for_a_malformed_container() {
        let bytes = triangle_glb();
        let scene = create_scene3d_from_glb_with_core_feature_handlers(&bytes, &[], None, None);
        assert_eq!(scene_children(&scene).len(), 1);
        let scene = create_scene3d_from_glb_with_core_feature_handlers(
            &byte_view(vec![1, 2, 3]),
            &[],
            None,
            None,
        );
        assert!(scene_children(&scene).is_empty());
    }
}

mod create_scene3d_from_gltf_with_core_feature_handlers {
    use super::*;

    #[test]
    fn honors_scene_one_for_json_and_rejects_a_malformed_source_with_an_empty_scene() {
        let source = GltfSource::Json(GltfJsonSource {
            source: r#"{"asset":{"version":"2.0"},"nodes":[{"name":"a"},{"name":"b"}],"scenes":[{"nodes":[]},{"nodes":[1]}],"scene":1}"#,
        });
        let scene = create_scene3d_from_gltf_with_core_feature_handlers(&source, &[], None, None);
        assert_eq!(scene_children(&scene).len(), 1);
        let source = GltfSource::Json(GltfJsonSource { source: "{" });
        let scene = create_scene3d_from_gltf_with_core_feature_handlers(&source, &[], None, None);
        assert!(scene_children(&scene).is_empty());
    }
}

mod parse_glb_with_core_feature_handlers {
    use super::*;

    #[test]
    fn builds_real_geometry_and_retains_original_bin_backing_for_a_context_kept_after_parse() {
        let bytes = triangle_glb();
        let captured: Arc<RwLock<Option<Ref<GltfCoreFeatureContext>>>> =
            Arc::new(RwLock::new(None));
        let retained = captured.clone();
        let handler = Arc::new(RwLock::new(GltfCoreFeatureHandler {
            kind: "vendor".to_string(),
            apply: Arc::new(move |context| {
                assert!(context.try_write().is_ok());
                let document = context.read().unwrap().document.clone();
                assert!(document.try_write().is_ok());
                *retained.write().unwrap() = Some(context.clone());
            }),
        }));
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let document =
            parse_glb_with_core_feature_handlers(&bytes, &[handler], Some(&diagnostics), None);
        assert!(diagnostics.read().unwrap().is_empty());
        assert_eq!(document.read().unwrap().meshes.len(), 1);
        let geometry = document.read().unwrap().meshes[0].geometry.clone();
        assert_eq!(geometry.read().unwrap().vertices.len(), 36);
        let context = captured.read().unwrap().clone().unwrap();
        assert!(Arc::ptr_eq(&context.read().unwrap().document, &document));
        let read_accessor = context.read().unwrap().read_accessor.clone();
        let storage = get_array_buffer_storage(&bytes.buffer);
        let bin_offset = bytes.byte_offset + bytes.byte_length - 36;
        storage.write().unwrap()[bin_offset..bin_offset + 4]
            .copy_from_slice(&9.0_f32.to_le_bytes());
        let accessor = read_accessor(0.0, Some("VEC3"));
        let GltfComponentArray::Float32(data) = accessor.data else {
            panic!("expected float accessor")
        };
        assert_eq!(data.values.read().unwrap()[0], 9.0);
        assert_eq!(geometry.read().unwrap().vertices[0], 0.0);
    }
}

mod parse_gltf_with_core_feature_handlers {
    use super::*;

    #[test]
    fn retains_document_source_and_index_maps_and_returns_fresh_world_transforms_after_parse() {
        let captured: Arc<RwLock<Option<Ref<GltfCoreFeatureContext>>>> =
            Arc::new(RwLock::new(None));
        let retained = captured.clone();
        let handler = Arc::new(RwLock::new(GltfCoreFeatureHandler {
            kind: "vendor".to_string(),
            apply: Arc::new(move |context| {
                assert!(context.try_write().is_ok());
                *retained.write().unwrap() = Some(context.clone());
            }),
        }));
        let input = GltfSource::Json(GltfJsonSource {
            source: r#"{"asset":{"version":"2.0"},"nodes":[{"children":[1],"translation":[1,0,0]},{"translation":[2,0,0]}]}"#,
        });
        let document =
            parse_gltf_with_core_feature_handlers(&input, &[handler.clone()], None, None);
        let context = captured.read().unwrap().clone().unwrap();
        let (source, build, indices) = {
            let context = context.read().unwrap();
            (
                context.source.clone(),
                context.build_node_transform.clone(),
                context.node_indices.clone(),
            )
        };
        assert!(Arc::ptr_eq(&context.read().unwrap().document, &document));
        assert_eq!(&*indices.read().unwrap(), &[0, 1]);
        assert_eq!(build(1.0).position.x, 3.0);
        let mut detached = build(1.0);
        detached.position.x = 99.0;
        assert_eq!(build(1.0).position.x, 3.0);
        assert_eq!(build(-1.0).position.x, 0.0);
        document.write().unwrap().nodes[1].transform.position.x = 99.0;
        assert_eq!(build(1.0).position.x, 3.0);
        assert!(document.read().unwrap().metadata.is_none());
        let input = GltfSource::Document(GltfDocumentSource { source: &source });
        parse_gltf_with_core_feature_handlers(&input, &[handler], None, None);
        assert!(Arc::ptr_eq(
            &captured
                .read()
                .unwrap()
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .source,
            &source
        ));
    }

    #[test]
    fn runs_last_kind_replacements_at_first_position_then_extensions_and_flushes_aggregates_after_raw_handler_diagnostics()
     {
        let calls = Arc::new(RwLock::new(Vec::new()));
        let original_calls = calls.clone();
        let original = Arc::new(RwLock::new(GltfCoreFeatureHandler {
            kind: "vendor".to_string(),
            apply: Arc::new(move |_| original_calls.write().unwrap().push("original")),
        }));
        let sibling_calls = calls.clone();
        let sibling = Arc::new(RwLock::new(GltfCoreFeatureHandler {
            kind: "other".to_string(),
            apply: Arc::new(move |_| sibling_calls.write().unwrap().push("other")),
        }));
        let replacement_calls = calls.clone();
        let replacement = Arc::new(RwLock::new(GltfCoreFeatureHandler {
            kind: "vendor".to_string(),
            apply: Arc::new(move |_| replacement_calls.write().unwrap().push("replacement")),
        }));
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let expected_diagnostics = diagnostics.clone();
        let extension_calls = calls.clone();
        let extension = Arc::new(RwLock::new(GltfExtensionHandler {
            kind: "vendor.extension".to_string(),
            apply: Arc::new(move |context| {
                assert!(context.try_write().is_ok());
                let (sink, resolve) = {
                    let context = context.read().unwrap();
                    (
                        context.diagnostics.clone().unwrap(),
                        context.resolve_texture.clone(),
                    )
                };
                assert!(Arc::ptr_eq(&sink, &expected_diagnostics));
                assert!(resolve(None, TextureColorSpace::Linear).is_none());
                extension_calls.write().unwrap().push("extension");
                report_import_diagnostic(
                    Some(&mut sink.write().unwrap()),
                    ImportDiagnosticSeverity::Skip,
                    "vendor.raw",
                    "vendor.extension",
                    None,
                );
            }),
        }));
        let options = GltfImportOptions {
            base_path: None,
            extension_handlers: Some(vec![extension]),
            external_buffers: None,
            draco_registry: None,
        };
        let source = GltfSource::Json(GltfJsonSource {
            source: r#"{"asset":{"version":"2.0"},"cameras":[{"type":"perspective","perspective":{"yfov":1,"znear":0.1}}]}"#,
        });
        parse_gltf_with_core_feature_handlers(
            &source,
            &[original, sibling, replacement],
            Some(&diagnostics),
            Some(&options),
        );
        assert_eq!(
            &*calls.read().unwrap(),
            &["replacement", "other", "extension"]
        );
        let diagnostics = diagnostics.read().unwrap();
        assert_eq!(diagnostics[0].kind, "vendor.raw");
        assert_eq!(diagnostics[1].kind, "gltf.duplicate-core-feature-handler");
        assert_eq!(diagnostics[2].kind, "gltf.core-feature-handler-missing");
        assert_eq!(diagnostics[2].severity, ImportDiagnosticSeverity::Skip);
    }
}

fn byte_view(bytes: Vec<u8>) -> ArrayBufferView {
    let length = bytes.len();
    let mut backing = vec![0xa5; 3];
    backing.extend(bytes);
    backing.push(0xee);
    let buffer = create_array_buffer_from_bytes(backing.into_boxed_slice());
    return create_array_buffer_view(&buffer, 3, length, ArrayBufferViewKind::Uint8Array).unwrap();
}

fn scene_children(scene: &Scene3D) -> Vec<NodeRef> {
    let root: NodeRef = scene.root.clone();
    let mut children = Vec::new();
    get_node_children(&mut children, &root);
    return children;
}

fn triangle_glb() -> ArrayBufferView {
    let mut json = TRIANGLE.as_bytes().to_vec();
    while json.len() % 4 != 0 {
        json.push(b' ');
    }
    let binary: Vec<_> = [0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
    let length = 12 + 8 + json.len() + 8 + binary.len();
    let mut out = Vec::new();
    for word in [0x46546c67, 2, length as u32, json.len() as u32, 0x4e4f534a] {
        out.extend(word.to_le_bytes());
    }
    out.extend(json);
    out.extend((binary.len() as u32).to_le_bytes());
    out.extend(0x004e4942_u32.to_le_bytes());
    out.extend(binary);
    return byte_view(out);
}
