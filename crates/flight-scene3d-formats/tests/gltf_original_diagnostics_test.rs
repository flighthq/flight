use crate::gltf_original_test_helper::*;
use crate::gltf_test_helper::gltf_data_uri;
use flight_geometry::create_vector3;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_meshgeometry::{get_mesh_geometry_vertex_count, get_mesh_geometry_vertex_position};
use flight_scene3d::Mesh;
use flight_scene3d_formats::contract::*;
use serde_json::json;
use std::sync::{Arc, RwLock};

mod diagnostics_coverage {
    use super::*;

    #[test]
    fn case_006_rejects_and_reports_gltf_not_an_object_for_a_json_scalar() {
        let source = json!(42);

        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let _scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.not-an-object",
            ImportDiagnosticSeverity::Reject,
            "parseGltfSource",
            &[],
        );
    }

    #[test]
    fn case_007_rejects_and_reports_glb_header_too_small_for_a_sub_12_byte_container() {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        create_scene3d_from_glb(&original_byte_view(vec![0; 4]), Some(&diagnostics), None);
        assert_original_diagnostic(
            &diagnostics,
            "glb.header-too-small",
            ImportDiagnosticSeverity::Reject,
            "readGlbContainer",
            &[],
        );
    }

    #[test]
    fn case_008_rejects_and_reports_glb_no_json_chunk_for_a_header_only_container() {
        let bytes: Vec<_> = [0x46546c67_u32, 2, 12]
            .into_iter()
            .flat_map(u32::to_le_bytes)
            .collect();
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        create_scene3d_from_glb(&original_byte_view(bytes), Some(&diagnostics), None);
        assert_original_diagnostic(
            &diagnostics,
            "glb.no-json-chunk",
            ImportDiagnosticSeverity::Reject,
            "readGlbContainer",
            &[],
        );
    }

    #[test]
    fn case_009_recovers_and_reports_glb_chunk_past_end_when_the_oversized_chunk_is_the_json_chunk_no_usable_document()
     {
        let mut bytes = original_glb_bytes(&original_gltf_fixture("triangle"), &[]);
        let oversize = bytes.len() as u32 + 1000;
        bytes[12..16].copy_from_slice(&oversize.to_le_bytes());
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = create_scene3d_from_glb(&original_byte_view(bytes), Some(&diagnostics), None);
        assert_original_diagnostic(
            &diagnostics,
            "glb.chunk-past-end",
            ImportDiagnosticSeverity::Recover,
            "readGlbContainer",
            &[],
        );
        assert!(
            diagnostics
                .read()
                .unwrap()
                .iter()
                .any(|entry| entry.kind == "glb.no-json-chunk")
        );
        assert!(original_children(&scene).is_empty());
    }

    #[test]
    fn case_010_recovers_via_glb_chunk_past_end_and_still_returns_the_document_when_a_valid_json_chunk_precedes_the_bad_chunk()
     {
        let mut bytes = original_glb_bytes(&original_gltf_fixture("triangle"), &[]);
        let second = 20 + u32::from_le_bytes(bytes[12..16].try_into().unwrap()) as usize;
        let oversize = bytes.len() as u32 + 1000;
        bytes[second..second + 4].copy_from_slice(&oversize.to_le_bytes());
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = create_scene3d_from_glb(&original_byte_view(bytes), Some(&diagnostics), None);
        assert_original_diagnostic(
            &diagnostics,
            "glb.chunk-past-end",
            ImportDiagnosticSeverity::Recover,
            "readGlbContainer",
            &[],
        );
        assert_eq!(original_children(&scene).len(), 1);
        assert!(
            !diagnostics
                .read()
                .unwrap()
                .iter()
                .any(|entry| entry.kind == "glb.no-json-chunk")
        );
    }

    #[test]
    fn case_011_drops_and_reports_gltf_camera_missing_for_a_node_referencing_a_missing_camera() {
        let source =
            json!({"asset":{"version":"2.0"},"nodes":[{"camera":5}],"scenes":[{"nodes":[0]}]});

        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let _scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.camera-missing",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[
                ("count", ImportDiagnosticDetailValue::Number(1.0)),
                ("firstCamera", ImportDiagnosticDetailValue::Number(5.0)),
                ("firstNode", ImportDiagnosticDetailValue::Number(0.0)),
            ],
        );
    }

    #[test]
    fn case_012_drops_and_reports_gltf_camera_invalid_perspective_for_a_bad_view_volume() {
        let source = json!({"asset":{"version":"2.0"},"cameras":[{"perspective":{"yfov":0,"znear":0.1},"type":"perspective"}],"nodes":[{"camera":0}],"scenes":[{"nodes":[0]}]});

        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let _scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.camera-invalid-perspective",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[("firstCamera", ImportDiagnosticDetailValue::Number(0.0))],
        );
    }

    #[test]
    fn case_013_drops_and_reports_gltf_camera_invalid_orthographic_for_a_bad_view_volume() {
        let source = json!({"asset":{"version":"2.0"},"cameras":[{"orthographic":{"xmag":0,"ymag":1,"zfar":10,"znear":0},"type":"orthographic"}],"nodes":[{"camera":0}],"scenes":[{"nodes":[0]}]});

        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let _scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.camera-invalid-orthographic",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[],
        );
    }

    #[test]
    fn case_014_drops_and_reports_gltf_camera_missing_descriptor_for_a_type_with_no_descriptor() {
        let source = json!({"asset":{"version":"2.0"},"cameras":[{"type":"perspective"}],"nodes":[{"camera":0}],"scenes":[{"nodes":[0]}]});

        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let _scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.camera-missing-descriptor",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[(
                "firstType",
                ImportDiagnosticDetailValue::String("perspective".to_string()),
            )],
        );
    }

    #[test]
    fn case_015_recovers_and_reports_gltf_node_child_out_of_range_for_a_child_index_outside_the_node_table()
     {
        let source = json!({"asset":{"version":"2.0"},"nodes":[{"children":[9]},{}],"scenes":[{"nodes":[0,1]}]});

        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let _scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.node-child-out-of-range",
            ImportDiagnosticSeverity::Recover,
            "buildGltfDocument",
            &[("firstChild", ImportDiagnosticDetailValue::Number(9.0))],
        );
    }

    #[test]
    fn case_016_drops_and_reports_gltf_animation_target_unresolved_for_a_channel_targeting_an_out_of_range_node()
     {
        let mut source = original_gltf_fixture("triangle");
        source["animations"] = json!([{"channels":[{"sampler":0,"target":{"node":99,"path":"translation"}}],"samplers":[{"input":0,"output":0}]}]);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let _scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.animation-target-unresolved",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[("firstTarget", ImportDiagnosticDetailValue::Number(99.0))],
        );
    }

    #[test]
    fn case_017_recovers_and_reports_gltf_node_multiple_parents_when_two_nodes_claim_the_same_child()
     {
        let source = json!({"asset":{"version":"2.0"},"nodes":[{"children":[2]},{"children":[2]},{}],"scenes":[{"nodes":[0,1]}]});

        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let _scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.node-multiple-parents",
            ImportDiagnosticSeverity::Recover,
            "buildGltfDocument",
            &[("firstChild", ImportDiagnosticDetailValue::Number(2.0))],
        );
    }

    #[test]
    fn case_018_recovers_and_reports_gltf_duplicate_extension_handler_for_two_handlers_of_one_kind()
    {
        let applied = Arc::new(RwLock::new(String::new()));
        let first_applied = applied.clone();
        let first = Arc::new(RwLock::new(GltfExtensionHandler {
            kind: "VENDOR_x".to_string(),
            apply: Arc::new(move |_| *first_applied.write().unwrap() = "first".to_string()),
        }));
        let last_applied = applied.clone();
        let last = Arc::new(RwLock::new(GltfExtensionHandler {
            kind: "VENDOR_x".to_string(),
            apply: Arc::new(move |_| *last_applied.write().unwrap() = "last".to_string()),
        }));
        let source = original_gltf_fixture("triangle").to_string();
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        create_scene3d_from_gltf(
            &GltfSource::Json(GltfJsonSource { source: &source }),
            Some(&diagnostics),
            Some(&GltfImportOptions {
                base_path: None,
                draco_registry: None,
                external_buffers: None,
                extension_handlers: Some(vec![first, last]),
            }),
        );
        assert_eq!(*applied.read().unwrap(), "last");
        assert_original_diagnostic(
            &diagnostics,
            "gltf.duplicate-extension-handler",
            ImportDiagnosticSeverity::Recover,
            "buildGltfDocument",
            &[(
                "firstKind",
                ImportDiagnosticDetailValue::String("VENDOR_x".to_string()),
            )],
        );
    }

    #[test]
    fn case_019_drops_and_reports_gltf_animation_missing_sampler_for_an_out_of_range_sampler() {
        let mut source = original_gltf_fixture("triangle");
        source["animations"] = json!([{"channels":[{"sampler":9,"target":{"node":0,"path":"translation"}}],"samplers":[]}]);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let _scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.animation-missing-sampler",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[("firstSampler", ImportDiagnosticDetailValue::Number(9.0))],
        );
    }

    #[test]
    fn case_020_skips_and_reports_gltf_animation_unsupported_path_for_an_unknown_target_path() {
        let mut source = original_gltf_fixture("triangle");
        source["animations"] = json!([{"channels":[{"sampler":0,"target":{"node":0,"path":"color"}}],"samplers":[{"input":1,"output":0}]}]);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let _scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.animation-unsupported-path",
            ImportDiagnosticSeverity::Skip,
            "buildGltfDocument",
            &[(
                "firstPath",
                ImportDiagnosticDetailValue::String("color".to_string()),
            )],
        );
    }

    #[test]
    fn case_021_drops_and_reports_gltf_morph_target_no_position_for_a_position_less_morph_target() {
        let mut source = original_gltf_fixture("triangle");
        source["meshes"][0]["primitives"][0]["targets"] = json!([{"NORMAL":0}]);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let _scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.morph-target-no-position",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[("firstTarget", ImportDiagnosticDetailValue::Number(0.0))],
        );
    }

    #[test]
    fn case_022_drops_the_whole_morph_set_not_just_the_target_when_a_position_delta_count_mismatches_the_base()
     {
        let mut source = original_gltf_fixture("morph");
        source["accessors"][2]["count"] = json!(1);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.morph-target-count-mismatch",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[
                ("firstExpected", ImportDiagnosticDetailValue::Number(3.0)),
                ("firstActual", ImportDiagnosticDetailValue::Number(1.0)),
            ],
        );
        let children = original_children(&scene);
        assert!(
            children[0]
                .read()
                .unwrap()
                .as_any()
                .downcast_ref::<Mesh>()
                .unwrap()
                .morph
                .is_none()
        );
    }

    #[test]
    fn case_023_drops_the_whole_morph_set_when_any_target_faults_so_weight_target_correspondence_stays_honest()
     {
        let mut source = original_gltf_fixture("morph");
        source["meshes"][0]["primitives"][0]["targets"] = json!([{"POSITION":99},{"POSITION":2}]);
        source["meshes"][0]["weights"] = json!([0.25, 0.75]);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.morph-target-no-position",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[("firstTarget", ImportDiagnosticDetailValue::Number(0.0))],
        );
        let children = original_children(&scene);
        assert!(
            children[0]
                .read()
                .unwrap()
                .as_any()
                .downcast_ref::<Mesh>()
                .unwrap()
                .morph
                .is_none()
        );
    }

    #[test]
    fn case_024_recovers_and_reports_gltf_buffer_empty_no_uri_for_a_uri_less_buffer_on_the_json_path()
     {
        let mut source = original_gltf_fixture("triangle");
        source["buffers"] = json!([{"byteLength":4}]);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let _scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.buffer-empty",
            ImportDiagnosticSeverity::Recover,
            "buildGltfDocument",
            &[(
                "reason",
                ImportDiagnosticDetailValue::String("no-uri-no-binary".to_string()),
            )],
        );
    }

    #[test]
    fn case_025_recovers_and_reports_gltf_accessor_buffer_not_found_for_an_optional_attribute_with_a_missing_buffer()
     {
        let mut source = original_gltf_fixture("triangle");
        source["accessors"]
            .as_array_mut()
            .unwrap()
            .push(json!({"bufferView":2,"componentType":5126,"count":3,"type":"VEC3"}));
        source["bufferViews"]
            .as_array_mut()
            .unwrap()
            .push(json!({"buffer":9,"byteLength":36,"byteOffset":0}));
        source["meshes"][0]["primitives"][0]["attributes"]["NORMAL"] = json!(2);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.accessor-buffer-not-found",
            ImportDiagnosticSeverity::Recover,
            "buildGltfDocument",
            &[("firstBuffer", ImportDiagnosticDetailValue::Number(9.0))],
        );
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 3);
        for value in &geometry.vertices {
            assert!(value.is_finite());
        }
    }

    #[test]
    fn case_026_recovers_and_reports_gltf_accessor_count_mismatch_for_an_optional_attribute_shorter_than_position()
     {
        let mut source = original_gltf_fixture("triangle");
        source["accessors"]
            .as_array_mut()
            .unwrap()
            .push(json!({"bufferView":0,"componentType":5126,"count":1,"type":"VEC3"}));
        source["meshes"][0]["primitives"][0]["attributes"]["NORMAL"] = json!(2);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.accessor-count-mismatch",
            ImportDiagnosticSeverity::Recover,
            "buildGltfDocument",
            &[
                ("firstExpected", ImportDiagnosticDetailValue::Number(3.0)),
                ("firstActual", ImportDiagnosticDetailValue::Number(1.0)),
            ],
        );
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 3);
        for value in &geometry.vertices {
            assert!(value.is_finite());
        }
    }

    #[test]
    fn case_027_drops_an_animation_channel_with_an_empty_sampler_instead_of_creating_an_empty_track()
     {
        let mut source = original_channel_gltf(
            "LINEAR",
            &[0.0, 0.0, 0.0, 1.0],
            1,
            "VEC4",
            "rotation",
            &[0.0],
        );
        source["accessors"][1]["count"] = json!(0);
        source["accessors"][2]["count"] = json!(0);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.animation-sampler-empty",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[],
        );
        assert!(scene.animations.is_empty());
    }

    #[test]
    fn case_028_drops_an_animation_channel_whose_output_element_count_mismatches_the_keyframe_count()
     {
        let source = original_channel_gltf(
            "LINEAR",
            &[0.0, 0.0, 0.0, 1.0],
            1,
            "VEC4",
            "rotation",
            &[0.0, 1.0],
        );

        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.animation-sampler-cardinality",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[],
        );
        assert!(scene.animations.is_empty());
    }

    #[test]
    fn case_029_drops_a_weights_animation_channel_whose_output_width_mismatches_the_morph_target_count()
     {
        let mut source = original_gltf_fixture("morph");
        source["accessors"][5]["count"] = json!(1);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.weights-cardinality-mismatch",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[
                ("firstExpected", ImportDiagnosticDetailValue::Number(2.0)),
                ("firstActual", ImportDiagnosticDetailValue::Number(1.0)),
            ],
        );
        assert!(scene.animations.is_empty());
    }

    #[test]
    fn case_030_recovers_and_reports_gltf_sparse_bufferview_not_found_for_a_bad_sparse_bufferview()
    {
        let mut source = original_gltf_fixture("triangle");
        source["accessors"][0]["sparse"] = json!({"count":1,"indices":{"bufferView":9,"componentType":5123},"values":{"bufferView":9}});
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let _scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.sparse-bufferview-not-found",
            ImportDiagnosticSeverity::Recover,
            "buildGltfDocument",
            &[],
        );
    }

    #[test]
    fn case_031_recovers_and_reports_gltf_sparse_invalid_read_for_an_oversized_sparse_count() {
        let mut source = original_gltf_fixture("triangle");
        source["accessors"][0]["sparse"] = json!({"count":100,"indices":{"bufferView":0,"componentType":5123},"values":{"bufferView":0}});
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.sparse-invalid-read",
            ImportDiagnosticSeverity::Recover,
            "buildGltfDocument",
            &[],
        );
        let geometry = original_first_geometry(&scene);
        assert_eq!(get_mesh_geometry_vertex_count(&geometry.read().unwrap()), 3);
    }

    #[test]
    fn case_032_drops_an_animation_channel_whose_output_accessor_type_mismatches_the_path() {
        let source = original_channel_gltf(
            "LINEAR",
            &[0.0, 0.0, 0.0, 1.0, 2.0, 3.0],
            2,
            "VEC3",
            "rotation",
            &[0.0, 1.0],
        );

        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.accessor-type-mismatch",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[],
        );
        assert!(scene.animations.is_empty());
    }

    #[test]
    fn case_033_recovers_and_reports_gltf_accessor_type_mismatch_for_an_optional_attribute_of_the_wrong_type()
     {
        let mut source = original_gltf_fixture("triangle");
        source["accessors"]
            .as_array_mut()
            .unwrap()
            .push(json!({"bufferView":0,"componentType":5126,"count":3,"type":"VEC2"}));
        source["meshes"][0]["primitives"][0]["attributes"]["NORMAL"] = json!(2);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.accessor-type-mismatch",
            ImportDiagnosticSeverity::Recover,
            "buildGltfDocument",
            &[],
        );
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 3);
        for value in &geometry.vertices {
            assert!(value.is_finite());
        }
    }

    #[test]
    fn case_034_recovers_and_reports_gltf_sparse_index_out_of_range_for_a_sparse_index_past_the_accessor_count()
     {
        let positions = [0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
        let mut bytes: Vec<_> = positions
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        bytes.extend(99_u16.to_le_bytes());
        bytes.extend(
            [9.0_f32, 9.0, 9.0]
                .iter()
                .flat_map(|value| value.to_le_bytes()),
        );
        let source = json!({"accessors":[{"bufferView":0,"componentType":5126,"count":3,"sparse":{"count":1,"indices":{"bufferView":1,"componentType":5123},"values":{"bufferView":2}},"type":"VEC3"}],"bufferViews":[{"buffer":0,"byteLength":36,"byteOffset":0},{"buffer":0,"byteLength":2,"byteOffset":36},{"buffer":0,"byteLength":12,"byteOffset":38}],"buffers":[{"byteLength":50,"uri":gltf_data_uri(&bytes)}],"asset":{"version":"2.0"},"meshes":[{"primitives":[{"attributes":{"POSITION":0}}]}],"nodes":[{"mesh":0}],"scene":0,"scenes":[{"nodes":[0]}]});
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.sparse-index-out-of-range",
            ImportDiagnosticSeverity::Recover,
            "buildGltfDocument",
            &[("firstIndex", ImportDiagnosticDetailValue::Number(99.0))],
        );
        let geometry = original_first_geometry(&scene);
        assert_eq!(get_mesh_geometry_vertex_count(&geometry.read().unwrap()), 3);
    }

    #[test]
    fn case_035_drops_the_primitive_when_the_position_accessor_overruns_its_declared_bufferview_window()
     {
        let mut source = original_gltf_fixture("triangle");
        source["bufferViews"][0]["byteLength"] = json!(4);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.primitive-no-position",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[],
        );
        let children = original_children(&scene);
        assert!(!children[0].read().unwrap().as_any().is::<Mesh>());
    }

    #[test]
    fn case_036_drops_the_primitive_when_the_position_accessor_starts_before_its_declared_bufferview_window()
     {
        let bytes: Vec<_> = [
            91.0_f32, 92.0, 93.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0,
        ]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
        let source = json!({"accessors":[{"bufferView":0,"byteOffset":-12,"componentType":5126,"count":3,"type":"VEC3"}],"bufferViews":[{"buffer":0,"byteLength":36,"byteOffset":12}],"buffers":[{"byteLength":48,"uri":gltf_data_uri(&bytes)}],"asset":{"version":"2.0"},"meshes":[{"primitives":[{"attributes":{"POSITION":0}}]}],"nodes":[{"mesh":0}],"scene":0,"scenes":[{"nodes":[0]}]});
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.primitive-no-position",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[],
        );
        let children = original_children(&scene);
        assert!(!children[0].read().unwrap().as_any().is::<Mesh>());
    }

    #[test]
    fn case_037_drops_the_primitive_when_the_bufferview_bytestride_is_narrower_than_one_element() {
        let bytes: Vec<_> = [0.0_f32, 0.0, 0.0, 7.0, 8.0]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        let source = json!({"accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"}],"bufferViews":[{"buffer":0,"byteLength":20,"byteOffset":0,"byteStride":4}],"buffers":[{"byteLength":20,"uri":gltf_data_uri(&bytes)}],"asset":{"version":"2.0"},"meshes":[{"primitives":[{"attributes":{"POSITION":0}}]}],"nodes":[{"mesh":0}],"scene":0,"scenes":[{"nodes":[0]}]});
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.primitive-no-position",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[],
        );
        let children = original_children(&scene);
        assert!(!children[0].read().unwrap().as_any().is::<Mesh>());
    }

    #[test]
    fn case_038_drops_the_primitive_when_the_position_accessor_count_is_not_a_whole_nonnegative_number()
     {
        for count in [2.5, -3.0] {
            let mut source = original_gltf_fixture("triangle");
            source["accessors"][0]["count"] = json!(count);
            let diagnostics = Arc::new(RwLock::new(Vec::new()));
            let scene = original_scene(&source, Some(&diagnostics));
            assert_original_diagnostic(
                &diagnostics,
                "gltf.primitive-no-position",
                ImportDiagnosticSeverity::Drop,
                "buildGltfDocument",
                &[],
            );
            let children = original_children(&scene);
            assert!(!children[0].read().unwrap().as_any().is::<Mesh>());
        }
    }

    #[test]
    fn case_039_recovers_and_reports_gltf_sparse_invalid_read_for_a_sparse_values_read_starting_before_its_window()
     {
        let mut bytes: Vec<_> = [0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        bytes.extend(1_u16.to_le_bytes());
        bytes.extend(
            [91.0_f32, 92.0, 93.0, 9.0, 9.0, 9.0]
                .iter()
                .flat_map(|value| value.to_le_bytes()),
        );
        let source = json!({"accessors":[{"bufferView":0,"componentType":5126,"count":3,"sparse":{"count":1,"indices":{"bufferView":1,"componentType":5123},"values":{"bufferView":2,"byteOffset":-12}},"type":"VEC3"}],"bufferViews":[{"buffer":0,"byteLength":36,"byteOffset":0},{"buffer":0,"byteLength":2,"byteOffset":36},{"buffer":0,"byteLength":12,"byteOffset":50}],"buffers":[{"byteLength":62,"uri":gltf_data_uri(&bytes)}],"asset":{"version":"2.0"},"meshes":[{"primitives":[{"attributes":{"POSITION":0}}]}],"nodes":[{"mesh":0}],"scene":0,"scenes":[{"nodes":[0]}]});
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.sparse-invalid-read",
            ImportDiagnosticSeverity::Recover,
            "buildGltfDocument",
            &[],
        );
        let geometry = original_first_geometry(&scene);
        let mut position = create_vector3(0.0, 0.0, 0.0);
        get_mesh_geometry_vertex_position(&mut position, &geometry.read().unwrap(), 1);
        assert_eq!([position.x, position.y, position.z], [1.0, 0.0, 0.0]);
    }

    #[test]
    fn case_040_aggregates_repeated_accessor_not_found_recoveries_into_one_crumb_with_a_count() {
        let mut source = original_gltf_fixture("triangle");
        source["meshes"][0]["primitives"][0]["attributes"]["NORMAL"] = json!(99);
        source["meshes"][0]["primitives"][0]["attributes"]["TANGENT"] = json!(99);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        original_scene(&source, Some(&diagnostics));
        let diagnostics = diagnostics.read().unwrap();
        let matching: Vec<_> = diagnostics
            .iter()
            .filter(|entry| entry.kind == "gltf.accessor-not-found")
            .collect();
        assert_eq!(matching.len(), 1);
        let detail = matching[0].detail.as_ref().unwrap();
        let Some(ImportDiagnosticDetailValue::Number(count)) = detail.get("count") else {
            panic!("expected count");
        };
        assert!(*count >= 2.0);
        assert_eq!(
            detail.get("firstAccessor"),
            Some(&ImportDiagnosticDetailValue::Number(99.0))
        );
    }

    #[test]
    fn case_041_emits_no_diagnostics_when_no_collector_array_is_supplied() {
        let mut source = original_gltf_fixture("triangle");
        source["meshes"][0]["primitives"][0]["attributes"]["POSITION"] = json!(99);
        source["asset"] = json!({"version":"3.0"});
        original_scene(&source, None);
    }

    #[test]
    fn case_042_drops_and_reports_gltf_image_malformed_uri_for_a_data_uri_with_no_comma() {
        let source = json!({"asset":{"version":"2.0"},"images":[{"uri":"data:image/png;base64"}],"scenes":[]});

        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let _scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.image-malformed-uri",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[("firstImage", ImportDiagnosticDetailValue::Number(0.0))],
        );
    }

    #[test]
    fn case_043_drops_and_reports_gltf_image_bufferview_out_of_range_for_an_image_bufferview_outside_the_table()
     {
        let source = json!({"asset":{"version":"2.0"},"images":[{"bufferView":9}],"scenes":[]});

        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let _scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.image-bufferview-out-of-range",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[("firstBufferView", ImportDiagnosticDetailValue::Number(9.0))],
        );
    }

    #[test]
    fn case_044_drops_and_reports_gltf_image_bufferview_out_of_range_for_an_image_bufferview_starting_before_its_buffer()
     {
        let source = json!({"asset":{"version":"2.0"},"bufferViews":[{"buffer":0,"byteLength":4,"byteOffset":-4}],"buffers":[{"byteLength":8,"uri":gltf_data_uri(&[1,2,3,4,5,6,7,8])}],"images":[{"bufferView":0,"mimeType":"image/png"}],"scenes":[]});

        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let _scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.image-bufferview-out-of-range",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[("firstImage", ImportDiagnosticDetailValue::Number(0.0))],
        );
    }

    #[test]
    fn case_045_drops_and_reports_gltf_image_no_source_for_an_image_with_neither_uri_nor_bufferview()
     {
        let source = json!({"asset":{"version":"2.0"},"images":[{}],"scenes":[]});

        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let _scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.image-no-source",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[("firstImage", ImportDiagnosticDetailValue::Number(0.0))],
        );
    }

    #[test]
    fn case_046_recovers_and_reports_gltf_texture_source_missing_for_a_material_texture_whose_texture_has_no_source()
     {
        let source = json!({"asset":{"version":"2.0"},"materials":[{"pbrMetallicRoughness":{"baseColorTexture":{"index":0}}}],"scenes":[],"textures":[{}]});

        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let _scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.texture-source-missing",
            ImportDiagnosticSeverity::Recover,
            "buildGltfDocument",
            &[("firstTexture", ImportDiagnosticDetailValue::Number(0.0))],
        );
    }

    #[test]
    fn case_047_recovers_and_reports_gltf_texture_image_unresolved_for_a_material_texture_whose_image_failed_to_build()
     {
        let source = json!({"asset":{"version":"2.0"},"images":[{}],"materials":[{"pbrMetallicRoughness":{"baseColorTexture":{"index":0}}}],"scenes":[],"textures":[{"source":0}]});

        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let _scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.texture-image-unresolved",
            ImportDiagnosticSeverity::Recover,
            "buildGltfDocument",
            &[("firstImage", ImportDiagnosticDetailValue::Number(0.0))],
        );
    }
}
