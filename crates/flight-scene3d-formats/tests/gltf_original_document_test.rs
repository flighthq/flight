use crate::gltf_original_test_helper::*;
use flight_animation::AnimationInterpolation;
use flight_camera::Projection;
use flight_entity::Unknown;
use flight_geometry::create_vector3;
use flight_image::ImageResourceReference;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_materials::StandardPbrMaterial;
use flight_meshgeometry::{get_mesh_geometry_vertex_count, get_mesh_geometry_vertex_position};
use flight_node::NodeRef;
use flight_scene3d::{
    Scene3D, Scene3DAnimationPath, Scene3DAnimationTarget, Scene3DDocumentMaterial, is_mesh,
};
use flight_scene3d_formats::contract::*;
use serde_json::json;
use std::sync::{Arc, RwLock};

mod original_container_and_document {
    use super::*;

    #[test]
    fn case_121_resolves_the_basisu_image_source_in_preference_to_the_fallback() {
        let document = original_document(&original_basisu_gltf(true), None);
        let document = document.read().unwrap();
        let Scene3DDocumentMaterial::Entity(material) = &document.materials[0] else {
            panic!("expected entity");
        };
        let material = material.material.read().unwrap();
        let material = material
            .as_any()
            .downcast_ref::<StandardPbrMaterial>()
            .unwrap();
        let ImageResourceReference::External(resource) = get_test_texture_resource(
            &document.resources,
            material.base_color_map.as_ref().unwrap(),
        ) else {
            panic!("expected external");
        };
        assert_eq!(resource.reference.read().unwrap().uri, "compressed.ktx2");
    }

    #[test]
    fn case_122_resolves_a_basisu_texture_that_carries_no_fallback_source_at_all() {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let document = original_document(&original_basisu_gltf(false), Some(&diagnostics));
        let document = document.read().unwrap();
        let Scene3DDocumentMaterial::Entity(material) = &document.materials[0] else {
            panic!("expected entity");
        };
        let material = material.material.read().unwrap();
        let material = material
            .as_any()
            .downcast_ref::<StandardPbrMaterial>()
            .unwrap();
        assert!(material.base_color_map.is_some());
        assert!(
            !diagnostics
                .read()
                .unwrap()
                .iter()
                .any(|entry| entry.kind == "gltf.texture-source-missing")
        );
    }

    #[test]
    fn case_123_still_recovers_when_a_texture_genuinely_has_no_source_anywhere() {
        let mut source = original_basisu_gltf(false);
        source["textures"][0] = json!({"sampler":0});
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        original_document(&source, Some(&diagnostics));
        assert!(
            diagnostics
                .read()
                .unwrap()
                .iter()
                .any(|entry| entry.kind == "gltf.texture-source-missing")
        );
    }

    #[test]
    fn case_124_imports_geometry_from_a_glb_container_whose_buffer_is_backed_by_the_bin_chunk() {
        let binary: Vec<_> = [7.0, 8.0, 9.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
            .iter()
            .flat_map(|value: &f32| value.to_le_bytes())
            .collect();
        let source = json!({"accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"}],"asset":{"version":"2.0"},"bufferViews":[{"buffer":0,"byteLength":36,"byteOffset":0}],"buffers":[{"byteLength":36}],"meshes":[{"primitives":[{"attributes":{"POSITION":0}}]}],"nodes":[{"mesh":0}],"scene":0,"scenes":[{"nodes":[0]}]});
        let scene = create_scene3d_from_glb(
            &original_byte_view(original_glb_bytes(&source, &binary)),
            None,
            None,
        );
        let children = original_children(&scene);
        let node: Unknown = Some(Arc::new(children[0].clone()));
        assert!(is_mesh(&node));
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 3);
        let mut position = create_vector3(0.0, 0.0, 0.0);
        get_mesh_geometry_vertex_position(&mut position, &geometry, 0);
        assert_eq!([position.x, position.y, position.z], [7.0, 8.0, 9.0]);
    }

    #[test]
    fn case_125_returns_an_empty_scene_and_warns_when_the_magic_is_not_gltf() {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene =
            create_scene3d_from_glb(&original_byte_view(vec![0; 16]), Some(&diagnostics), None);
        assert!(original_children(&scene).is_empty());
        assert_original_diagnostic(
            &diagnostics,
            "glb.wrong-magic",
            ImportDiagnosticSeverity::Reject,
            "readGlbContainer",
            &[],
        );
    }

    #[test]
    fn case_126_returns_an_empty_scene_and_warns_when_the_byte_length_is_below_the_header_size() {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene =
            create_scene3d_from_glb(&original_byte_view(vec![0; 4]), Some(&diagnostics), None);
        assert!(original_children(&scene).is_empty());
        assert!(!diagnostics.read().unwrap().is_empty());
    }

    #[test]
    fn case_127_returns_an_empty_scene_and_warns_for_an_unsupported_glb_container_version() {
        let mut bytes = original_glb_bytes(&original_gltf_fixture("triangle"), &[]);
        bytes[4..8].copy_from_slice(&3_u32.to_le_bytes());
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = create_scene3d_from_glb(&original_byte_view(bytes), Some(&diagnostics), None);
        assert!(original_children(&scene).is_empty());
        assert_original_diagnostic(
            &diagnostics,
            "glb.unsupported-version",
            ImportDiagnosticSeverity::Reject,
            "readGlbContainer",
            &[("version", ImportDiagnosticDetailValue::Number(3.0))],
        );
    }

    #[test]
    fn case_128_returns_an_empty_scene_and_warns_when_the_glb_json_chunk_is_not_valid_json() {
        let mut bytes = original_glb_bytes(&original_gltf_fixture("triangle"), &[]);
        bytes[20] = 0x78;
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = create_scene3d_from_glb(&original_byte_view(bytes), Some(&diagnostics), None);
        assert!(original_children(&scene).is_empty());
        assert_original_diagnostic(
            &diagnostics,
            "glb.json-chunk-invalid",
            ImportDiagnosticSeverity::Reject,
            "readGlbContainer",
            &[],
        );
    }

    #[test]
    fn case_129_reads_a_quantized_position_accessor_through_the_existing_normalization_path() {
        let document = original_document(&original_quantized_gltf(false), None);
        let document = document.read().unwrap();
        assert_eq!(document.meshes.len(), 1);
        let mut position = create_vector3(0.0, 0.0, 0.0);
        get_mesh_geometry_vertex_position(
            &mut position,
            &document.meshes[0].geometry.read().unwrap(),
            1,
        );
        // D1 f32 bound (TS: 0.00005)
        assert!((position.x as f64 - 1.0).abs() <= 0.00005_f64.max(4.0 * f32::EPSILON as f64));
        // D1 f32 bound (TS: 0.00005)
        assert!((position.y as f64).abs() <= 0.00005_f64.max(4.0 * f32::EPSILON as f64));
    }

    #[test]
    fn case_130_does_not_report_the_extension_unsupported_when_a_file_requires_it() {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        original_document(&original_quantized_gltf(true), Some(&diagnostics));
        assert!(
            !diagnostics
                .read()
                .unwrap()
                .iter()
                .any(|entry| entry.kind == "gltf.unsupported-required-extension")
        );
    }

    #[test]
    fn case_131_still_reports_an_extension_nothing_satisfies() {
        let mut source = original_quantized_gltf(false);
        source["extensionsRequired"] = json!(["KHR_draco_mesh_compression"]);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        original_document(&source, Some(&diagnostics));
        assert!(
            diagnostics
                .read()
                .unwrap()
                .iter()
                .any(|entry| entry.kind == "gltf.unsupported-required-extension")
        );
    }

    #[test]
    fn case_132_reports_a_texcoord_set_the_parser_cannot_supply() {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        original_scene(
            &original_textured_gltf(json!({"index":0,"texCoord":1})),
            Some(&diagnostics),
        );
        assert_original_diagnostic(
            &diagnostics,
            "gltf.texcoord-set-unsupported",
            ImportDiagnosticSeverity::Recover,
            "buildGltfDocument",
            &[("firstUvSet", ImportDiagnosticDetailValue::Number(1.0))],
        );
    }

    #[test]
    fn case_133_lets_khr_texture_transform_override_the_set_it_reports() {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        original_scene(
            &original_textured_gltf(
                json!({"index":0,"texCoord":0,"extensions":{"KHR_texture_transform":{"texCoord":2}}}),
            ),
            Some(&diagnostics),
        );
        let diagnostics = diagnostics.read().unwrap();
        let diagnostic = diagnostics
            .iter()
            .find(|entry| entry.kind == "gltf.texcoord-set-unsupported")
            .unwrap();
        assert_eq!(
            diagnostic.detail.as_ref().unwrap().get("firstUvSet"),
            Some(&ImportDiagnosticDetailValue::Number(2.0))
        );
    }

    #[test]
    fn case_134_stays_silent_for_the_set_it_does_supply_whether_declared_or_omitted() {
        for info in [json!({"index":0}), json!({"index":0,"texCoord":0})] {
            let diagnostics = Arc::new(RwLock::new(Vec::new()));
            original_scene(&original_textured_gltf(info), Some(&diagnostics));
            assert!(
                !diagnostics
                    .read()
                    .unwrap()
                    .iter()
                    .any(|entry| entry.kind == "gltf.texcoord-set-unsupported")
            );
        }
    }

    #[test]
    fn case_135_still_builds_the_material_and_its_texture_this_is_a_recover_not_a_drop() {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let _scene: Scene3D = original_scene(
            &original_textured_gltf(json!({"index":0,"texCoord":1})),
            Some(&diagnostics),
        );
        // Source asserts only that the returned scene is non-null; Rust's concrete Scene3D return enforces it.
    }

    #[test]
    fn case_136_decomposes_a_gltf_document_into_index_referenced_tables_with_inline_geometry() {
        let document = original_document(&original_gltf_fixture("triangle"), None);
        let document = document.read().unwrap();
        assert_eq!(document.meshes.len(), 1);
        assert_eq!(
            get_mesh_geometry_vertex_count(&document.meshes[0].geometry.read().unwrap()),
            3
        );
        assert_eq!(document.nodes[0].mesh, Some(0));
        assert_eq!(document.nodes[0].transform.position.x, 5.0);
    }

    #[test]
    fn case_137_preserves_placed_perspective_and_orthographic_cameras_with_clip_planes() {
        let source = json!({"asset":{"version":"2.0"},"cameras":[{"name":"view","perspective":{"aspectRatio":1.5,"yfov":1,"znear":0.1},"type":"perspective"},{"orthographic":{"xmag":4,"ymag":3,"zfar":50,"znear":0},"type":"orthographic"}],"nodes":[{"camera":0,"children":[1],"translation":[1,2,3]},{"camera":1,"translation":[4,5,6]}],"scenes":[{"nodes":[0]}]});
        let document = original_document(&source, None);
        let document = document.read().unwrap();
        assert_eq!(document.cameras.len(), 2);
        let perspective = &document.cameras[0];
        assert_eq!(perspective.far, f32::INFINITY);
        assert_eq!(perspective.name.as_deref(), Some("view"));
        assert_eq!(perspective.node, Some(0));
        // D1 f32 bound (TS: 0)
        assert!((perspective.near as f64 - 0.1).abs() <= 4.0 * f32::EPSILON as f64);
        let Projection::Perspective(projection) = &perspective.projection else {
            panic!("expected perspective");
        };
        let projection = projection.read().unwrap();
        assert_eq!(projection.aspect, 1.5);
        assert_eq!(projection.fov_y, 1.0);
        let position = &perspective.transform.position;
        assert_eq!([position.x, position.y, position.z], [1.0, 2.0, 3.0]);
        let orthographic = &document.cameras[1];
        assert_eq!(orthographic.far, 50.0);
        assert_eq!(orthographic.near, 0.0);
        assert_eq!(orthographic.node, Some(1));
        let Projection::Orthographic(projection) = &orthographic.projection else {
            panic!("expected orthographic");
        };
        let projection = projection.read().unwrap();
        assert_eq!(projection.half_height, 3.0);
        assert_eq!(projection.half_width, 4.0);
        let position = &orthographic.transform.position;
        assert_eq!([position.x, position.y, position.z], [5.0, 7.0, 9.0]);
    }

    #[test]
    fn case_138_resolves_deeply_nested_camera_placement_without_using_the_call_stack() {
        let depth = 2048;
        let mut nodes = Vec::new();
        for index in 0..depth {
            let mut node = json!({"translation":[1,0,0]});
            if index == depth - 1 {
                node["camera"] = json!(0);
            }
            if index + 1 < depth {
                node["children"] = json!([index + 1]);
            }
            nodes.push(node);
        }
        let source = json!({"asset":{"version":"2.0"},"cameras":[{"perspective":{"yfov":1,"znear":0.1},"type":"perspective"}],"nodes":nodes,"scenes":[{"nodes":[0]}]});
        let document = original_document(&source, None);
        assert_eq!(
            document.read().unwrap().cameras[0].transform.position.x,
            depth as f32
        );
    }

    #[test]
    fn case_139_breaks_a_malformed_camera_node_cycle_deterministically() {
        let source = json!({"asset":{"version":"2.0"},"cameras":[{"perspective":{"yfov":1,"znear":0.1},"type":"perspective"}],"nodes":[{"camera":0,"children":[1],"translation":[1,0,0]},{"children":[0],"translation":[2,0,0]}],"scenes":[{"nodes":[0]}]});
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let document = original_document(&source, Some(&diagnostics));
        assert!(
            document.read().unwrap().cameras[0]
                .transform
                .position
                .x
                .is_finite()
        );
        assert_original_diagnostic(
            &diagnostics,
            "gltf.node-hierarchy-cycle",
            ImportDiagnosticSeverity::Recover,
            "buildGltfDocument",
            &[],
        );
    }

    #[test]
    fn case_140_expands_a_multi_primitive_mesh_into_a_group_node_with_per_primitive_child_mesh_nodes()
     {
        let bytes: Vec<_> = [0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        let mut source = original_geometry_gltf(
            json!([{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"}]),
            json!([{"buffer":0,"byteLength":36,"byteOffset":0}]),
            &bytes,
            json!([{"attributes":{"POSITION":0}},{"attributes":{"POSITION":0}}]),
        );
        source.as_object_mut().unwrap().remove("scene");
        let document = original_document(&source, None);
        let document = document.read().unwrap();
        assert_eq!(document.meshes.len(), 2);
        assert_eq!(document.nodes[0].mesh, None);
        assert_eq!(document.nodes[0].children.len(), 2);
        assert_eq!(
            document.nodes[document.nodes[0].children[0] as usize].mesh,
            Some(0)
        );
        assert_eq!(
            document.nodes[document.nodes[0].children[1] as usize].mesh,
            Some(1)
        );
    }

    #[test]
    fn case_141_carries_a_skin_as_joint_node_indices_plus_inverse_bind_matrices() {
        let document = original_document(&original_gltf_fixture("skinned"), None);
        let document = document.read().unwrap();
        assert_eq!(document.skins.len(), 1);
        assert!(!document.skins[0].joints.is_empty());
        assert_eq!(
            document.skins[0].inverse_bind.len(),
            document.skins[0].joints.len()
        );
    }

    #[test]
    fn case_142_returns_an_empty_document_and_warns_for_invalid_json() {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let document = parse_gltf(
            &GltfSource::Json(GltfJsonSource {
                source: "{ not json",
            }),
            Some(&diagnostics),
            None,
        );
        assert!(document.read().unwrap().nodes.is_empty());
        assert_original_diagnostic(
            &diagnostics,
            "gltf.invalid-json",
            ImportDiagnosticSeverity::Reject,
            "parseGltfSource",
            &[],
        );
    }

    #[test]
    fn case_143_parses_a_glb_container_into_a_scene3ddocument_decomposition() {
        let binary: Vec<_> = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0]
            .iter()
            .flat_map(|value: &f32| value.to_le_bytes())
            .collect();
        let source = json!({"accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"}],"asset":{"version":"2.0"},"bufferViews":[{"buffer":0,"byteLength":36,"byteOffset":0}],"buffers":[{"byteLength":36}],"meshes":[{"primitives":[{"attributes":{"POSITION":0}}]}],"nodes":[{"mesh":0}],"scene":0,"scenes":[{"nodes":[0]}]});
        let document = parse_glb(
            &original_byte_view(original_glb_bytes(&source, &binary)),
            None,
            None,
        );
        let document = document.read().unwrap();
        assert_eq!(document.meshes.len(), 1);
        assert_eq!(document.nodes.len(), 1);
        assert_eq!(document.nodes[0].mesh, Some(0));
        assert_eq!(document.scenes[0].root_nodes, [0]);
    }

    #[test]
    fn case_144_returns_an_empty_document_for_a_malformed_container() {
        let document = parse_glb(&original_byte_view(vec![1, 2, 3]), None, None);
        let document = document.read().unwrap();
        assert!(document.nodes.is_empty());
        assert!(document.scenes.is_empty());
    }

    #[test]
    fn case_145_returns_every_scene_the_document_declares_each_carrying_its_geometry() {
        let source = original_gltf_fixture("animatedMultiScene").to_string();
        let scenes = create_scene3ds_from_gltf(
            &GltfSource::Json(GltfJsonSource { source: &source }),
            None,
            None,
        );
        assert_eq!(scenes.len(), 2);
        assert_eq!(original_children(&scenes[0]).len(), 1);
        assert_eq!(original_children(&scenes[1]).len(), 1);
    }

    #[test]
    fn case_146_attaches_the_file_animation_clips_to_the_default_scene_bound_to_the_driven_node() {
        let source = original_gltf_fixture("animatedMultiScene").to_string();
        let scenes = create_scene3ds_from_gltf(
            &GltfSource::Json(GltfJsonSource { source: &source }),
            None,
            None,
        );
        assert_eq!(scenes[0].animations.len(), 1);
        let clip = scenes[0].animations.get("spin").unwrap().read().unwrap();
        assert_eq!(clip.channels.len(), 1);
        assert_eq!(clip.duration, 1.0);
        let channel = &clip.channels[0];
        let target = channel
            .target_ref
            .as_ref()
            .unwrap()
            .downcast_ref::<Scene3DAnimationTarget>()
            .unwrap();
        assert_eq!(target.path, Scene3DAnimationPath::Rotation);
        let node: NodeRef = target.node.clone();
        assert!(Arc::ptr_eq(&node, &original_children(&scenes[1])[0]));
        let track = channel.track.read().unwrap();
        assert!(track.quaternion);
        assert_eq!(track.components, 4);
        assert_eq!(track.interpolation, AnimationInterpolation::Linear);
        assert_eq!(&*track.times, &[0.0, 1.0]);
    }

    #[test]
    fn case_147_returns_an_empty_array_for_invalid_input() {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scenes = create_scene3ds_from_gltf(
            &GltfSource::Json(GltfJsonSource {
                source: "{ not json",
            }),
            Some(&diagnostics),
            None,
        );
        assert!(scenes.is_empty());
        assert_original_diagnostic(
            &diagnostics,
            "gltf.invalid-json",
            ImportDiagnosticSeverity::Reject,
            "parseGltfSource",
            &[],
        );
    }

    #[test]
    fn case_148_imports_every_scene_from_a_glb_container_with_animations_on_the_default_scene() {
        let glb = original_byte_view(original_glb_bytes(
            &original_gltf_fixture("animatedMultiScene"),
            &[],
        ));
        let scenes = create_scene3ds_from_glb(&glb, None, None);
        assert_eq!(scenes.len(), 2);
        assert_eq!(scenes[0].animations.len(), 1);
    }

    #[test]
    fn case_149_returns_an_empty_array_for_a_malformed_container() {
        assert!(
            create_scene3ds_from_glb(&original_byte_view(vec![1, 2, 3]), None, None).is_empty()
        );
    }

    #[test]
    fn case_150_keeps_every_built_in_core_feature_selected_on_the_zero_config_path() {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let document = original_document(&original_optional_core_gltf(), Some(&diagnostics));
        let document = document.read().unwrap();
        assert_eq!(document.cameras.len(), 1);
        assert_eq!(document.skins.len(), 1);
        assert!(
            !diagnostics
                .read()
                .unwrap()
                .iter()
                .any(|entry| entry.kind == "gltf.core-feature-handler-missing")
        );
    }

    #[test]
    fn case_151_keeps_bedrock_document_facts_and_reports_each_unregistered_optional_section_as_skipped()
     {
        let mut source = original_optional_core_gltf();
        source["extensionsRequired"] = json!(["VENDOR_unknown"]);
        let source = source.to_string();
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let document = parse_gltf_with_core_feature_handlers(
            &GltfSource::Json(GltfJsonSource { source: &source }),
            &[],
            Some(&diagnostics),
            None,
        );
        let document = document.read().unwrap();
        assert_eq!(document.meshes.len(), 1);
        assert_eq!(document.materials.len(), 1);
        assert_eq!(document.nodes.len(), 1);
        assert_eq!(document.scenes.len(), 1);
        assert!(document.animations.is_empty());
        assert!(document.cameras.is_empty());
        assert!(document.skins.is_empty());
        assert_eq!(document.meshes[0].skin, None);
        let diagnostics = diagnostics.read().unwrap();
        let missing: Vec<_> = diagnostics
            .iter()
            .filter(|entry| entry.kind == "gltf.core-feature-handler-missing")
            .collect();
        assert_eq!(missing.len(), 3);
        let kinds: Vec<_> = missing
            .iter()
            .map(
                |entry| match entry.detail.as_ref().unwrap().get("firstKind").unwrap() {
                    ImportDiagnosticDetailValue::String(kind) => kind.as_str(),
                    _ => panic!("expected firstKind"),
                },
            )
            .collect();
        assert_eq!(kinds, ["animations", "cameras", "skins"]);
        assert!(
            missing
                .iter()
                .all(|entry| entry.severity == ImportDiagnosticSeverity::Skip)
        );
        assert!(
            diagnostics
                .iter()
                .any(|entry| entry.kind == "gltf.unsupported-required-extension")
        );
    }

    #[test]
    fn case_152_imports_only_selected_families_and_reports_the_other_present_sections() {
        let source = original_optional_core_gltf().to_string();
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let document = parse_gltf_with_core_feature_handlers(
            &GltfSource::Json(GltfJsonSource { source: &source }),
            &[GLTF_CAMERAS_CORE_FEATURE_HANDLER.clone()],
            Some(&diagnostics),
            None,
        );
        let document = document.read().unwrap();
        assert_eq!(document.cameras.len(), 1);
        assert!(document.animations.is_empty());
        assert!(document.skins.is_empty());
        let diagnostics = diagnostics.read().unwrap();
        let kinds: Vec<_> = diagnostics
            .iter()
            .filter(|entry| entry.kind == "gltf.core-feature-handler-missing")
            .map(
                |entry| match entry.detail.as_ref().unwrap().get("firstKind").unwrap() {
                    ImportDiagnosticDetailValue::String(kind) => kind.as_str(),
                    _ => panic!("expected firstKind"),
                },
            )
            .collect();
        assert_eq!(kinds, ["animations", "skins"]);
    }

    #[test]
    fn case_153_uses_the_last_duplicate_source_kind_handler_and_reports_the_recovery() {
        let applied = Arc::new(RwLock::new(String::new()));
        let first_applied = applied.clone();
        let first = Arc::new(RwLock::new(GltfCoreFeatureHandler {
            kind: "cameras".to_string(),
            apply: Arc::new(move |_| *first_applied.write().unwrap() = "first".to_string()),
        }));
        let last_applied = applied.clone();
        let last = Arc::new(RwLock::new(GltfCoreFeatureHandler {
            kind: "cameras".to_string(),
            apply: Arc::new(move |_| *last_applied.write().unwrap() = "last".to_string()),
        }));
        let source = original_optional_core_gltf().to_string();
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        parse_gltf_with_core_feature_handlers(
            &GltfSource::Json(GltfJsonSource { source: &source }),
            &[first, last],
            Some(&diagnostics),
            None,
        );
        assert_eq!(*applied.read().unwrap(), "last");
        assert_original_diagnostic(
            &diagnostics,
            "gltf.duplicate-core-feature-handler",
            ImportDiagnosticSeverity::Recover,
            "buildGltfDocument",
            &[(
                "firstKind",
                ImportDiagnosticDetailValue::String("cameras".to_string()),
            )],
        );
    }

    #[test]
    fn case_154_supports_the_same_explicit_feature_selection_for_glb_containers() {
        let document = parse_glb_with_core_feature_handlers(
            &original_byte_view(original_glb_bytes(&original_optional_core_gltf(), &[])),
            &[GLTF_CAMERAS_CORE_FEATURE_HANDLER.clone()],
            None,
            None,
        );
        let document = document.read().unwrap();
        assert_eq!(document.meshes.len(), 1);
        assert_eq!(document.cameras.len(), 1);
        assert!(document.animations.is_empty());
        assert!(document.skins.is_empty());
    }
}
