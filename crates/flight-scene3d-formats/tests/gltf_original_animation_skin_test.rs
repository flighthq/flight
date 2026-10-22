use crate::gltf_original_test_helper::*;
use flight_animation::{AnimationInterpolation, sample_animation_track};
use flight_entity::Unknown;
use flight_geometry::create_vector3;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_meshgeometry::{
    get_mesh_geometry_index_count, get_mesh_geometry_vertex_count,
    get_mesh_geometry_vertex_position,
};
use flight_node::NodeRef;
use flight_node::contract::get_node_local_matrix4;
use flight_scene3d::{Scene3DAnimationPath, Scene3DAnimationTarget, is_mesh};
use flight_scene3d_formats::contract::*;
use serde_json::json;
use std::sync::{Arc, RwLock};

mod create_scene3d_from_gltf {
    use super::*;

    #[test]
    fn case_100_applies_a_matrix_transform_when_node_matrix_is_a_16_element_column_major_array() {
        let bytes: Vec<_> = [0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        let mut source = original_geometry_gltf(
            json!([{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"}]),
            json!([{"buffer":0,"byteLength":36,"byteOffset":0}]),
            &bytes,
            json!([{"attributes":{"POSITION":0}}]),
        );
        source["nodes"] = json!([{"matrix":[1,0,0,0,0,1,0,0,0,0,1,0,10,20,30,1],"mesh":0}]);
        let scene = original_scene(&source, None);
        let roots = original_children(&scene);
        let matrix = get_node_local_matrix4(&roots[0]);
        for (index, expected) in [
            (12, 10.0),
            (13, 20.0),
            (14, 30.0),
            (0, 1.0),
            (5, 1.0),
            (10, 1.0),
            (15, 1.0),
        ] {
            assert_original_close2(matrix.m[index], expected);
        }
    }

    #[test]
    fn case_101_applies_a_quaternion_rotation_from_node_rotation() {
        let bytes: Vec<_> = [0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        let mut source = original_geometry_gltf(
            json!([{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"}]),
            json!([{"buffer":0,"byteLength":36,"byteOffset":0}]),
            &bytes,
            json!([{"attributes":{"POSITION":0}}]),
        );
        let s = (std::f64::consts::PI / 4.0).sin();
        let c = (std::f64::consts::PI / 4.0).cos();
        source["nodes"] = json!([{"mesh":0,"rotation":[0.0,0.0,s,c]}]);
        let scene = original_scene(&source, None);
        let roots = original_children(&scene);
        let matrix = get_node_local_matrix4(&roots[0]);
        for (index, expected) in [(0, 0.0), (1, 1.0), (4, -1.0), (5, 0.0), (10, 1.0)] {
            assert_original_close2(matrix.m[index], expected);
        }
    }

    #[test]
    fn case_102_applies_scale_transforms_from_node_scale() {
        let bytes: Vec<_> = [0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        let mut source = original_geometry_gltf(
            json!([{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"}]),
            json!([{"buffer":0,"byteLength":36,"byteOffset":0}]),
            &bytes,
            json!([{"attributes":{"POSITION":0}}]),
        );
        source["nodes"] = json!([{"mesh":0,"scale":[2,3,4]}]);
        let scene = original_scene(&source, None);
        let roots = original_children(&scene);
        let matrix = get_node_local_matrix4(&roots[0]);
        for (index, expected) in [(0, 2.0), (5, 3.0), (10, 4.0), (1, 0.0), (2, 0.0), (4, 0.0)] {
            assert_original_close2(matrix.m[index], expected);
        }
    }

    #[test]
    fn case_103_reads_uint32_index_buffers_componenttype_5125_correctly() {
        let mut bytes: Vec<_> = [0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        bytes.extend([0_u32, 1, 2].iter().flat_map(|value| value.to_le_bytes()));
        let source = original_geometry_gltf(
            json!([{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"},{"bufferView":1,"componentType":5125,"count":3,"type":"SCALAR"}]),
            json!([{"buffer":0,"byteLength":36,"byteOffset":0},{"buffer":0,"byteLength":12,"byteOffset":36}]),
            &bytes,
            json!([{"attributes":{"POSITION":0},"indices":1}]),
        );
        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 3);
        assert_eq!(get_mesh_geometry_index_count(&geometry), 3);
        let mut position = create_vector3(0.0, 0.0, 0.0);
        get_mesh_geometry_vertex_position(&mut position, &geometry, 0);
        assert_eq!([position.x, position.y, position.z], [0.0, 0.0, 0.0]);
        get_mesh_geometry_vertex_position(&mut position, &geometry, 1);
        assert_eq!([position.x, position.y, position.z], [1.0, 0.0, 0.0]);
    }

    #[test]
    fn case_104_selects_the_correct_scene_when_the_document_scene_index_is_not_0() {
        let bytes: Vec<_> = [0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        let mut source = original_geometry_gltf(
            json!([{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"}]),
            json!([{"buffer":0,"byteLength":36,"byteOffset":0}]),
            &bytes,
            json!([{"attributes":{"POSITION":0}}]),
        );
        source["nodes"] = json!([{"translation":[99,0,0]},{"mesh":0}]);
        source["scene"] = json!(1);
        source["scenes"] = json!([{"nodes":[0]},{"nodes":[1]}]);
        let scene = original_scene(&source, None);
        let roots = original_children(&scene);
        assert_eq!(roots.len(), 1);
        let node: Unknown = Some(Arc::new(roots[0].clone()));
        assert!(is_mesh(&node));
    }

    #[test]
    fn case_105_warns_when_extensionsrequired_names_an_unsupported_extension() {
        let mut source = original_gltf_fixture("triangle");
        source["extensionsRequired"] = json!(["KHR_draco_mesh_compression"]);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.unsupported-required-extension",
            ImportDiagnosticSeverity::Skip,
            "buildGltfDocument",
            &[(
                "firstExtension",
                ImportDiagnosticDetailValue::String("KHR_draco_mesh_compression".to_string()),
            )],
        );
    }

    #[test]
    fn case_106_does_not_label_the_consumed_khr_texture_transform_extension_unsupported() {
        let mut source = original_gltf_fixture("triangle");
        source["extensionsRequired"] = json!(["KHR_texture_transform"]);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        original_scene(&source, Some(&diagnostics));
        assert!(diagnostics.read().unwrap().is_empty());
    }

    #[test]
    fn case_107_imports_a_skin_binding_the_mesh_to_a_skeleton_over_its_joint_nodes() {
        let scene = original_scene(&original_gltf_fixture("skinned"), None);
        let roots = original_children(&scene);
        let node: Unknown = Some(Arc::new(roots[0].clone()));
        assert!(is_mesh(&node));
        with_original_mesh(&scene, |mesh| {
            let skin = mesh.skin.as_ref().unwrap().read().unwrap();
            let skeleton = skin.skeleton.read().unwrap();
            let joints = skeleton.joints.read().unwrap();
            assert_eq!(joints.len(), 1);
            let joint: NodeRef = joints[0].clone();
            assert!(Arc::ptr_eq(&joint, &roots[1]));
            assert_eq!(skeleton.names.as_deref(), Some(&["joint".to_string()][..]));
        });
    }

    #[test]
    fn case_108_emits_the_skinned_layout_with_renormalized_weights_for_a_skinned_primitive() {
        let scene = original_scene(&original_gltf_fixture("skinned"), None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(geometry.layout.read().unwrap().stride, 80);
        assert_eq!(geometry.vertices[12], 0.0);
        assert_original_close2(geometry.vertices[16], 1.0);
    }

    #[test]
    fn case_109_defaults_inverse_bind_matrices_to_identity_when_the_skin_omits_them() {
        let scene = original_scene(&original_gltf_fixture("skinnedIdentity"), None);
        with_original_mesh(&scene, |mesh| {
            let skin = mesh.skin.as_ref().unwrap().read().unwrap();
            let skeleton = skin.skeleton.read().unwrap();
            let inverse_bind = skeleton.inverse_bind_matrices.read().unwrap();
            assert_eq!(inverse_bind.len(), 16);
            for index in [0, 5, 10, 15] {
                assert_eq!(inverse_bind[index], 1.0);
            }
            assert_eq!(inverse_bind[1], 0.0);
        });
    }

    #[test]
    fn case_110_recovers_to_identity_inverse_bind_matrices_when_the_accessor_has_too_few_for_the_joints()
     {
        let mut source = original_gltf_fixture("skinned");
        source["accessors"][3]["count"] = json!(0);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.skin-ibm-count-mismatch",
            ImportDiagnosticSeverity::Recover,
            "buildGltfDocument",
            &[
                ("firstExpected", ImportDiagnosticDetailValue::Number(1.0)),
                ("firstActual", ImportDiagnosticDetailValue::Number(0.0)),
            ],
        );
        with_original_mesh(&scene, |mesh| {
            let skin = mesh.skin.as_ref().unwrap().read().unwrap();
            let skeleton = skin.skeleton.read().unwrap();
            let inverse_bind = skeleton.inverse_bind_matrices.read().unwrap();
            for index in [0, 5, 10, 15] {
                assert_eq!(inverse_bind[index], 1.0);
            }
            assert_eq!(inverse_bind[1], 0.0);
        });
    }

    #[test]
    fn case_111_leaves_an_unskinned_primitive_on_the_canonical_layout_with_no_skin() {
        let scene = original_scene(&original_gltf_fixture("triangle"), None);
        with_original_mesh(&scene, |mesh| {
            assert!(mesh.skin.is_none());
            assert_eq!(
                mesh.geometry.read().unwrap().layout.read().unwrap().stride,
                48
            );
        });
    }

    #[test]
    fn case_112_drops_a_weights_channel_targeting_a_node_with_no_morphable_mesh_with_a_warning() {
        let mut source = original_gltf_fixture("animatedMultiScene");
        source["animations"][0]["samplers"]
            .as_array_mut()
            .unwrap()
            .push(json!({"input":1,"interpolation":"LINEAR","output":1}));
        source["animations"][0]["channels"]
            .as_array_mut()
            .unwrap()
            .push(json!({"sampler":1,"target":{"node":1,"path":"weights"}}));
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        let clip = scene.animations.get("spin").unwrap().read().unwrap();
        assert_eq!(clip.channels.len(), 1);
        assert_original_diagnostic(
            &diagnostics,
            "gltf.weights-no-morphable-mesh",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[],
        );
    }

    #[test]
    fn case_113_imports_a_translation_channel_as_a_3_component_non_quaternion_track() {
        let source = original_channel_gltf(
            "LINEAR",
            &[0.0, 0.0, 0.0, 1.0, 2.0, 3.0],
            2,
            "VEC3",
            "translation",
            &[0.0, 1.0],
        );
        let scene = original_scene(&source, None);
        let clip = scene.animations.get("animation0").unwrap().read().unwrap();
        let target = clip.channels[0]
            .target_ref
            .as_ref()
            .unwrap()
            .downcast_ref::<Scene3DAnimationTarget>()
            .unwrap();
        assert_eq!(target.path, Scene3DAnimationPath::Translation);
        let track = clip.channels[0].track.read().unwrap();
        assert!(!track.quaternion);
        assert_eq!(track.components, 3);
    }

    #[test]
    fn case_114_imports_a_scale_channel_as_a_3_component_scale_track_that_samples_its_vec3_values()
    {
        let source = original_channel_gltf(
            "LINEAR",
            &[1.0, 1.0, 1.0, 2.0, 2.0, 2.0],
            2,
            "VEC3",
            "scale",
            &[0.0, 1.0],
        );
        let scene = original_scene(&source, None);
        let clip = scene.animations.get("animation0").unwrap().read().unwrap();
        let target = clip.channels[0]
            .target_ref
            .as_ref()
            .unwrap()
            .downcast_ref::<Scene3DAnimationTarget>()
            .unwrap();
        assert_eq!(target.path, Scene3DAnimationPath::Scale);
        let track = clip.channels[0].track.read().unwrap();
        assert_eq!(track.components, 3);
        let mut out = [0.0; 3];
        sample_animation_track(&mut out, &track, 0.5);
        for value in out {
            assert_original_close5(value, 1.5);
        }
    }

    #[test]
    fn case_115_maps_the_step_sampler_interpolation_to_a_step_track_that_holds_the_previous_keyframe()
     {
        let source = original_channel_gltf(
            "STEP",
            &[0.0, 0.0, 0.0, 1.0, 0.0, 0.7071, 0.0, 0.7071],
            2,
            "VEC4",
            "rotation",
            &[0.0, 1.0],
        );
        let scene = original_scene(&source, None);
        let clip = scene.animations.get("animation0").unwrap().read().unwrap();
        let track = clip.channels[0].track.read().unwrap();
        assert_eq!(track.interpolation, AnimationInterpolation::Step);
        let mut out = [0.0; 4];
        sample_animation_track(&mut out, &track, 0.5);
        assert_eq!(out, [0.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn case_116_maps_the_cubicspline_sampler_interpolation_to_a_cubic_hermite_track_that_samples_correctly()
     {
        let output = [
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 10.0, 0.0, 0.0, 0.0, 0.0,
            0.0,
        ];
        let source = original_channel_gltf(
            "CUBICSPLINE",
            &output,
            6,
            "VEC3",
            "translation",
            &[0.0, 1.0],
        );
        let scene = original_scene(&source, None);
        let clip = scene.animations.get("animation0").unwrap().read().unwrap();
        let track = clip.channels[0].track.read().unwrap();
        assert_eq!(track.interpolation, AnimationInterpolation::Cubic);
        let mut out = [0.0; 3];
        sample_animation_track(&mut out, &track, 0.5);
        for (actual, expected) in out.iter().zip([5.0, 0.0, 0.0]) {
            assert_original_close5(*actual, expected);
        }
    }

    #[test]
    fn case_117_returns_an_empty_scene_for_invalid_input() {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = create_scene3d_from_gltf(
            &GltfSource::Json(GltfJsonSource {
                source: "{ not json",
            }),
            Some(&diagnostics),
            None,
        );
        assert!(original_children(&scene).is_empty());
        assert!(scene.animations.is_empty());
        assert_original_diagnostic(
            &diagnostics,
            "gltf.invalid-json",
            ImportDiagnosticSeverity::Reject,
            "parseGltfSource",
            &[],
        );
    }

    #[test]
    fn case_118_reads_primitives_targets_into_the_mesh_morph_set_with_seeded_weights() {
        let scene = original_scene(&original_gltf_fixture("morph"), None);
        with_original_mesh(&scene, |mesh| {
            let morph = mesh.morph.as_ref().unwrap().read().unwrap();
            assert_eq!(morph.targets.len(), 1);
            assert_eq!(
                &*morph.targets[0].position_deltas,
                &[0.0, 10.0, 0.0, 0.0, 10.0, 0.0, 0.0, 10.0, 0.0]
            );
            assert_eq!(
                morph.targets[0].normal_deltas.as_deref(),
                Some(&[0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0][..])
            );
            assert!(morph.targets[0].tangent_deltas.is_none());
            assert_eq!(&*morph.weights, &[0.0]);
        });
    }

    #[test]
    fn case_119_reads_a_morph_target_tangent_accessor_into_non_null_tangentdeltas() {
        let bytes: Vec<_> = [
            0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0,
            1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0,
        ]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
        let mut source = original_geometry_gltf(
            json!([{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"},{"bufferView":1,"componentType":5126,"count":3,"type":"VEC3"},{"bufferView":2,"componentType":5126,"count":3,"type":"VEC3"}]),
            json!([{"buffer":0,"byteLength":36,"byteOffset":0},{"buffer":0,"byteLength":36,"byteOffset":36},{"buffer":0,"byteLength":36,"byteOffset":72}]),
            &bytes,
            json!([{"attributes":{"POSITION":0},"targets":[{"POSITION":1,"TANGENT":2}]}]),
        );
        source["meshes"][0]["weights"] = json!([0]);
        let scene = original_scene(&source, None);
        with_original_mesh(&scene, |mesh| {
            let morph = mesh.morph.as_ref().unwrap().read().unwrap();
            assert_eq!(
                morph.targets[0].tangent_deltas.as_deref(),
                Some(&[1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0][..])
            );
        });
    }

    #[test]
    fn case_120_imports_a_weights_channel_bound_to_the_mesh_morph_its_width_the_target_count() {
        let scene = original_scene(&original_gltf_fixture("morph"), None);
        assert_eq!(scene.animations.len(), 1);
        let clip = scene.animations.get("blink").unwrap().read().unwrap();
        assert_eq!(clip.channels.len(), 1);
        let channel = &clip.channels[0];
        let target = channel
            .target_ref
            .as_ref()
            .unwrap()
            .downcast_ref::<Scene3DAnimationTarget>()
            .unwrap();
        assert_eq!(target.path, Scene3DAnimationPath::Weights);
        let node: NodeRef = target.node.clone();
        assert!(Arc::ptr_eq(&node, &original_children(&scene)[0]));
        let track = channel.track.read().unwrap();
        assert_eq!(track.components, 1);
        assert_eq!(&*track.times, &[0.0, 1.0]);
    }
}
