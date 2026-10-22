use super::awd2_test_helper::*;
use flight_animation::sample_animation_track;
use flight_compression::{
    CompressionFraming, HostDecompressDeflateCapability, SDK_HOST_DECOMPRESS_DEFLATE,
};
use flight_entity::Ref;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_node::{NodeRef, get_node_children, get_node_parent};
use flight_scene3d::{Mesh, Scene3DAnimationPath, Scene3DAnimationTarget, Scene3DDocument};
use flight_scene3d_formats::*;
use std::sync::{Arc, RwLock};

fn animation_fixture(
    pose0: Option<[f64; 12]>,
    pose1: Option<[f64; 12]>,
    durations: [u16; 2],
) -> Vec<u8> {
    return file(&[
        block(
            AWD2_BLOCK_SKELETON,
            0,
            1,
            &skeleton_body("Skeleton", &[("Joint0", 0, IDENTITY_TRANSFORM)], false),
        ),
        block(
            AWD2_BLOCK_SKELETON_POSE,
            0,
            2,
            &pose_body("P0", &[pose0], false),
        ),
        block(
            AWD2_BLOCK_SKELETON_POSE,
            0,
            3,
            &pose_body("P1", &[pose1], false),
        ),
        block(
            AWD2_BLOCK_SKELETON_ANIMATION,
            0,
            4,
            &animation_body("Anim", &[(durations[0], 2), (durations[1], 3)]),
        ),
    ]);
}

fn assert_finite_nodes(document: &Scene3DDocument) {
    for node in &document.nodes {
        let t = &node.transform;
        assert!(
            [
                t.position.x,
                t.position.y,
                t.position.z,
                t.rotation.x,
                t.rotation.y,
                t.rotation.z,
                t.rotation.w,
                t.scale.x,
                t.scale.y,
                t.scale.z
            ]
            .iter()
            .all(|value| value.is_finite())
        );
    }
}

fn create_state() -> Awd2ParseState {
    let mut state = create_awd2_parse_state();
    state.document = empty_document();
    state.diagnostics = Some(Arc::new(RwLock::new(Vec::new())));
    return state;
}

fn compressed_input(payload: &[u8]) -> Ref<Box<[u8]>> {
    let mut bytes = file(&[]);
    bytes[7] = AWD2_COMPRESSION_DEFLATE;
    bytes[8..12].copy_from_slice(&(payload.len() as u32).to_le_bytes());
    bytes.extend_from_slice(payload);
    return Arc::new(RwLock::new(bytes.into_boxed_slice()));
}

fn full_options() -> Awd2ParseOptions {
    return Awd2ParseOptions {
        blocks: AWD2_ALL_BLOCK_HANDLERS.clone(),
        deflate: Some(Some(Arc::new(SDK_HOST_DECOMPRESS_DEFLATE.clone()))),
        lzma: None,
    };
}

fn invoke_build(handler: &Ref<Awd2BlockHandler>, state: &mut Awd2ParseState) {
    let build = handler.read().unwrap().build.clone().unwrap();
    build(state);
}

fn invoke_parse(
    handler: &Ref<Awd2BlockHandler>,
    state: &mut Awd2ParseState,
    id: u32,
    body: &[u8],
    wide: bool,
) {
    let source = Arc::new(RwLock::new(body.to_vec().into_boxed_slice()));
    let block = Awd2Block {
        block_id: id,
        block_type: handler.read().unwrap().block_types[0],
        data_start: 0,
        data_end: body.len(),
        geometry_wide: false,
        matrix_wide: wide,
        source: source.clone(),
        view: source,
    };
    let parse = handler.read().unwrap().parse.clone();
    parse(state, &block);
}

fn parse(bytes: &[u8]) -> (Ref<Scene3DDocument>, Vec<ImportDiagnostic>) {
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    let document = parse_awd2(
        &Arc::new(RwLock::new(bytes.to_vec().into_boxed_slice())),
        &skeleton_options(),
        Some(&diagnostics),
    );
    let diagnostics = diagnostics.read().unwrap().clone();
    return (document, diagnostics);
}

fn sample(channel: &flight_scene3d::Scene3DDocumentAnimationChannel, time: f32) -> Vec<f32> {
    let track = channel.track.read().unwrap();
    let mut out = vec![0.0; track.components];
    sample_animation_track(&mut out, &track, time);
    return out;
}

fn skeleton_options() -> Awd2ParseOptions {
    return Awd2ParseOptions {
        blocks: AWD2_SKELETON_FAMILY.clone(),
        deflate: Some(Some(Arc::new(SDK_HOST_DECOMPRESS_DEFLATE.clone()))),
        lzma: None,
    };
}

mod awd2_skeleton_animation_handler {
    use super::*;

    #[test]
    fn claims_animation_blocks_with_deferred_parse_and_the_animation_build_phase() {
        let handler = AWD2_SKELETON_ANIMATION_HANDLER.read().unwrap();
        assert_eq!(handler.block_types, [AWD2_BLOCK_SKELETON_ANIMATION]);
        assert_eq!(handler.deferred, Some(true));
        assert_eq!(
            handler.build_phase,
            Some(AWD2_BUILD_PHASE_SKELETON_ANIMATION as f32)
        );
        assert!(handler.build.is_some());
    }

    #[test]
    fn samples_source_translation_keys_and_interpolated_values_in_right_handed_space() {
        let mut moved = IDENTITY_TRANSFORM;
        moved[9..12].copy_from_slice(&[10.0, 20.0, 30.0]);
        let (document, diagnostics) = parse(&animation_fixture(
            Some(IDENTITY_TRANSFORM),
            Some(moved),
            [1000, 1000],
        ));
        assert!(diagnostics.is_empty());
        let document = document.read().unwrap();
        let animation = &document.animations[0];
        assert_eq!(animation.duration, 2.0);
        let channel = &animation.channels[0];
        for (time, expected) in [
            (0.0, [0.0f32, 0.0, 0.0]),
            (1.0, [10.0, 20.0, -30.0]),
            (0.5, [5.0, 10.0, -15.0]),
        ] {
            for (actual, expected) in sample(channel, time).iter().zip(expected) {
                // D1 f32 bound (TS: 0.5e-2)
                assert!(
                    (*actual - expected).abs()
                        <= 0.5e-2f32.max(4.0 * f32::EPSILON * expected.abs().max(1.0))
                );
            }
        }
        assert_eq!(animation.channels[1].path, Scene3DAnimationPath::Rotation);
        assert!(animation.channels[1].track.read().unwrap().quaternion);
    }

    #[test]
    fn emits_decomposed_nonunit_scale_and_omits_the_scale_channel_for_identity_scale() {
        for scaled in [false, true] {
            let mut moved = IDENTITY_TRANSFORM;
            if scaled {
                moved[0] = 2.0;
                moved[4] = 3.0;
                moved[8] = 4.0;
            } else {
                moved[9] = 10.0;
            }
            let (document, diagnostics) = parse(&animation_fixture(
                Some(IDENTITY_TRANSFORM),
                Some(moved),
                [1000, 1000],
            ));
            assert!(diagnostics.is_empty());
            let document = document.read().unwrap();
            let channels = &document.animations[0].channels;
            let channel = channels
                .iter()
                .find(|channel| channel.path == Scene3DAnimationPath::Scale);
            if scaled {
                let channel = channel.unwrap();
                assert_eq!(channel.track.read().unwrap().components, 3);
                for (time, expected) in [(0.0, [1.0, 1.0, 1.0]), (1.0, [2.0, 3.0, 4.0])] {
                    assert_eq!(
                        sample(channel, time)
                            .iter()
                            .map(|value| (value * 1000.0).round() / 1000.0)
                            .collect::<Vec<_>>(),
                        expected
                    );
                }
            } else {
                assert!(channel.is_none());
                assert_eq!(channels.len(), 2);
            }
        }
    }

    #[test]
    fn defaults_null_or_short_pose_transforms_to_identity_without_reporting_a_missing_block() {
        for transforms in [vec![None], Vec::new()] {
            let bytes = file(&[
                block(
                    AWD2_BLOCK_SKELETON,
                    0,
                    1,
                    &skeleton_body("Skeleton", &[("Joint0", 0, IDENTITY_TRANSFORM)], false),
                ),
                block(
                    AWD2_BLOCK_SKELETON_POSE,
                    0,
                    2,
                    &pose_body("P0", &transforms, false),
                ),
                block(
                    AWD2_BLOCK_SKELETON_ANIMATION,
                    0,
                    3,
                    &animation_body("Anim", &[(100, 2)]),
                ),
            ]);
            let (document, diagnostics) = parse(&bytes);
            assert!(diagnostics.is_empty());
            let document = document.read().unwrap();
            assert_eq!(sample(&document.animations[0].channels[0], 0.0), [0.0; 3]);
            assert_eq!(
                sample(&document.animations[0].channels[1], 0.0),
                [0.0, 0.0, 0.0, 1.0]
            );
        }
    }

    #[test]
    fn converts_each_millisecond_duration_to_seconds_including_the_final_pose_duration() {
        let bytes = file(&[
            block(
                AWD2_BLOCK_SKELETON,
                0,
                1,
                &skeleton_body("Skeleton", &[("Root", 0, IDENTITY_TRANSFORM)], false),
            ),
            block(
                AWD2_BLOCK_SKELETON_POSE,
                0,
                2,
                &pose_body("P0", &[Some(IDENTITY_TRANSFORM)], false),
            ),
            block(
                AWD2_BLOCK_SKELETON_POSE,
                0,
                3,
                &pose_body("P1", &[Some(IDENTITY_TRANSFORM)], false),
            ),
            block(
                AWD2_BLOCK_SKELETON_ANIMATION,
                0,
                4,
                &animation_body("Anim", &[(250, 2), (750, 3)]),
            ),
        ]);
        let (document, diagnostics) = parse(&bytes);
        assert!(diagnostics.is_empty());
        let document = document.read().unwrap();
        let animation = &document.animations[0];
        // D1 f32 bound (TS: 0.5e-2)
        assert!((animation.duration - 1.0).abs() <= 0.5e-2f32.max(2.0 * f32::EPSILON));
        for (actual, expected) in animation.channels[0]
            .track
            .read()
            .unwrap()
            .times
            .iter()
            .zip([0.0, 0.25])
        {
            // D1 f32 bound (TS: 0.5e-2)
            assert!((*actual - expected).abs() <= 0.5e-2f32.max(2.0 * f32::EPSILON));
        }
    }

    #[test]
    fn keeps_each_named_animation_in_file_order_sampling_its_own_pose_and_names_empty_blocks_by_the_original_index()
     {
        let mut idle = IDENTITY_TRANSFORM;
        idle[9] = 3.0;
        let mut attack = IDENTITY_TRANSFORM;
        attack[9] = 9.0;
        let bytes = file(&[
            block(
                AWD2_BLOCK_SKELETON,
                0,
                1,
                &skeleton_body("Skeleton", &[("Root", 0, IDENTITY_TRANSFORM)], false),
            ),
            block(
                AWD2_BLOCK_SKELETON_POSE,
                0,
                2,
                &pose_body("IdlePose", &[Some(idle)], false),
            ),
            block(
                AWD2_BLOCK_SKELETON_POSE,
                0,
                3,
                &pose_body("AttackPose", &[Some(attack)], false),
            ),
            block(
                AWD2_BLOCK_SKELETON_ANIMATION,
                0,
                4,
                &animation_body("idle", &[(100, 2)]),
            ),
            block(
                AWD2_BLOCK_SKELETON_ANIMATION,
                0,
                5,
                &animation_body("attack", &[(100, 3)]),
            ),
        ]);
        let (document, diagnostics) = parse(&bytes);
        assert!(diagnostics.is_empty());
        let document = document.read().unwrap();
        assert_eq!(
            document
                .animations
                .iter()
                .map(|animation| animation.name.as_deref())
                .collect::<Vec<_>>(),
            [Some("idle"), Some("attack")]
        );
        let mut names = document
            .animations
            .iter()
            .map(|animation| animation.name.as_deref().unwrap())
            .collect::<Vec<_>>();
        names.sort();
        assert_eq!(names, ["attack", "idle"]);
        for (animation, expected) in document.animations.iter().zip([3.0, 9.0]) {
            // D1 f32 bound (TS: 0.5e-2)
            assert!(
                (sample(&animation.channels[0], 0.0)[0] - expected).abs()
                    <= 0.5e-2f32.max(4.0 * f32::EPSILON * expected)
            );
        }
        let mut state = create_state();
        invoke_parse(
            &AWD2_SKELETON_BLOCK_HANDLER,
            &mut state,
            1,
            &skeleton_body("", &[("", 0, IDENTITY_TRANSFORM)], false),
            false,
        );
        invoke_parse(
            &AWD2_SKELETON_ANIMATION_HANDLER,
            &mut state,
            2,
            &animation_body("", &[]),
            false,
        );
        invoke_parse(
            &AWD2_SKELETON_ANIMATION_HANDLER,
            &mut state,
            3,
            &animation_body("", &[(100, 9)]),
            false,
        );
        invoke_build(&AWD2_SKELETON_BLOCK_HANDLER, &mut state);
        invoke_build(&AWD2_SKELETON_ANIMATION_HANDLER, &mut state);
        assert_eq!(
            state.document.read().unwrap().animations[0].name.as_deref(),
            Some("animation1")
        );
    }

    #[test]
    fn preserves_empty_pose_and_missing_pose_diagnostics_on_both_document_and_public_scene_paths() {
        for missing in [false, true] {
            let bytes = file(&[
                block(
                    AWD2_BLOCK_SKELETON,
                    0,
                    1,
                    &skeleton_body("Rig", &[("Root", 0, IDENTITY_TRANSFORM)], false),
                ),
                block(
                    AWD2_BLOCK_SKELETON_ANIMATION,
                    0,
                    2,
                    &animation_body("Anim", if missing { &[(100, 99)] } else { &[] }),
                ),
            ]);
            for scene_path in [false, true] {
                let diagnostics = Arc::new(RwLock::new(Vec::new()));
                let source = Arc::new(RwLock::new(bytes.clone().into_boxed_slice()));
                if scene_path {
                    create_scene3d_from_awd2(&source, &full_options(), Some(&diagnostics));
                } else {
                    let document = parse_awd2(&source, &skeleton_options(), Some(&diagnostics));
                    assert_eq!(document.read().unwrap().animations.len(), missing as usize);
                }
                let diagnostics = diagnostics.read().unwrap();
                assert_eq!(diagnostics.len(), 1);
                let diagnostic = &diagnostics[0];
                assert_eq!(diagnostic.origin, "buildAwdDocumentAnimation");
                if missing {
                    assert_eq!(diagnostic.kind, "awd2.pose-block-missing");
                    assert_eq!(diagnostic.severity, ImportDiagnosticSeverity::Recover);
                    assert_eq!(
                        diagnostic
                            .detail
                            .as_ref()
                            .unwrap()
                            .get("distinctPoseBlocks"),
                        Some(&ImportDiagnosticDetailValue::Number(1.0))
                    );
                    assert_eq!(
                        diagnostic.detail.as_ref().unwrap().get("firstPoseBlock"),
                        Some(&ImportDiagnosticDetailValue::Number(99.0))
                    );
                } else {
                    assert_eq!(diagnostic.kind, "awd2.animation-no-poses");
                    assert_eq!(diagnostic.severity, ImportDiagnosticSeverity::Drop);
                    assert!(diagnostic.detail.is_none());
                }
            }
        }
    }

    #[test]
    fn aggregates_distinct_missing_pose_ids_across_all_joints_using_the_minimum_id_and_skips_build_without_joints()
     {
        let bytes = file(&[
            block(
                AWD2_BLOCK_SKELETON_ANIMATION,
                0,
                9,
                &animation_body("Anim", &[(100, 99), (200, 7), (300, 99)]),
            ),
            block(
                AWD2_BLOCK_SKELETON,
                0,
                1,
                &skeleton_body(
                    "Rig",
                    &[
                        ("Root", 0, IDENTITY_TRANSFORM),
                        ("Child", 1, IDENTITY_TRANSFORM),
                    ],
                    false,
                ),
            ),
        ]);
        let (document, diagnostics) = parse(&bytes);
        assert_eq!(document.read().unwrap().animations[0].channels.len(), 4);
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(
            diagnostics[0]
                .detail
                .as_ref()
                .unwrap()
                .get("distinctPoseBlocks"),
            Some(&ImportDiagnosticDetailValue::Number(2.0))
        );
        assert_eq!(
            diagnostics[0]
                .detail
                .as_ref()
                .unwrap()
                .get("firstPoseBlock"),
            Some(&ImportDiagnosticDetailValue::Number(7.0))
        );
        let (document, diagnostics) = parse(&file(&[block(
            AWD2_BLOCK_SKELETON_ANIMATION,
            0,
            9,
            &animation_body("", &[]),
        )]));
        assert!(document.read().unwrap().animations.is_empty());
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn retains_source_rejections_for_truncated_invalid_magic_and_awd3_input_through_the_skeleton_family()
     {
        let mut awd3 = file(&[]);
        awd3[3] = 3;
        for (bytes, kind, origin, version) in [
            (vec![0; 4], "awd2.header-too-short", "parseAwd2", false),
            (vec![0; 12], "awd2.bad-magic", "parseAwd2", false),
            (awd3, "awd2.unsupported-version", "isAwd2Version", true),
        ] {
            let (document, diagnostics) = parse(&bytes);
            assert!(document.read().unwrap().animations.is_empty());
            assert_eq!(diagnostics.len(), 1);
            assert_eq!(diagnostics[0].kind, kind);
            assert_eq!(diagnostics[0].origin, origin);
            assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Reject);
            if version {
                assert_eq!(
                    diagnostics[0].detail.as_ref().unwrap().get("version"),
                    Some(&ImportDiagnosticDetailValue::Number(3.0))
                );
            } else {
                assert!(diagnostics[0].detail.is_none());
            }
        }
    }
}

mod awd2_skeleton_block_handler {
    use super::*;

    #[test]
    fn claims_skeleton_blocks_with_first_pass_parse_and_skeleton_build_phase() {
        let handler = AWD2_SKELETON_BLOCK_HANDLER.read().unwrap();
        assert_eq!(handler.block_types, [AWD2_BLOCK_SKELETON]);
        assert_ne!(handler.deferred, Some(true));
        assert_eq!(handler.build_phase, Some(AWD2_BUILD_PHASE_SKELETON as f32));
        assert!(handler.build.is_some());
    }

    #[test]
    fn preserves_inverse_bind_matrices_and_decomposes_parent_relative_bind_transforms_for_both_wire_widths()
     {
        for wide in [false, true] {
            let mut root = IDENTITY_TRANSFORM;
            root[9] = 3.0;
            let mut child = IDENTITY_TRANSFORM;
            child[9] = 5.0;
            child[11] = 7.0;
            let mut state = create_state();
            invoke_parse(
                &AWD2_SKELETON_BLOCK_HANDLER,
                &mut state,
                1,
                &skeleton_body(
                    "Rig",
                    &[
                        ("Root", 0, root),
                        ("Child", 1, child),
                        ("", 99, IDENTITY_TRANSFORM),
                    ],
                    wide,
                ),
                wide,
            );
            invoke_build(&AWD2_SKELETON_BLOCK_HANDLER, &mut state);
            let document = state.document.read().unwrap();
            assert_eq!(document.nodes.len(), 4);
            assert_eq!(document.scenes[0].root_nodes, [0]);
            assert_eq!(document.nodes[0].name.as_deref(), Some("skeleton"));
            assert_eq!(document.nodes[0].children, [1, 3]);
            assert_eq!(document.nodes[1].children, [2]);
            assert_eq!(document.nodes[3].name, None);
            assert_eq!(state.skeleton_joint_node_indices, [1, 2, 3]);
            assert_eq!(document.skins[0].joints, [1, 2, 3]);
            assert_eq!(state.skin_index, Some(0));
            assert_eq!(document.skins[0].inverse_bind[0].m[12], 3.0);
            assert_eq!(document.skins[0].inverse_bind[1].m[14], -7.0);
            assert_eq!(document.nodes[1].transform.position.x, -3.0);
            assert_eq!(document.nodes[2].transform.position.x, -2.0);
            assert_eq!(document.nodes[2].transform.position.z, 7.0);
            assert!(
                state
                    .diagnostics
                    .as_ref()
                    .unwrap()
                    .read()
                    .unwrap()
                    .is_empty()
            );
        }
    }

    #[test]
    fn recovers_singular_joints_by_name_keeps_descendants_finite_and_leaves_raw_inverse_bind_entries_untouched()
     {
        for transforms in [
            vec![[0.0; 12]],
            vec![[0.0; 12], IDENTITY_TRANSFORM],
            vec![IDENTITY_TRANSFORM; 2],
        ] {
            let joints = transforms
                .iter()
                .enumerate()
                .map(|(index, transform)| {
                    (
                        format!("J{index}"),
                        if index == 0 { 0 } else { index as u16 },
                        *transform,
                    )
                })
                .collect::<Vec<_>>();
            let joints = joints
                .iter()
                .map(|(name, parent, transform)| (name.as_str(), *parent, *transform))
                .collect::<Vec<_>>();
            let (document, diagnostics) = parse(&file(&[block(
                AWD2_BLOCK_SKELETON,
                0,
                1,
                &skeleton_body("Rig", &joints, false),
            )]));
            let document = document.read().unwrap();
            assert_finite_nodes(&document);
            if transforms[0] == [0.0; 12] {
                assert_eq!(diagnostics.len(), 1);
                assert_eq!(diagnostics[0].kind, "awd2.joint-matrix-singular");
                assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
                assert_eq!(diagnostics[0].origin, "parseAwd2");
                assert_eq!(
                    diagnostics[0].detail.as_ref().unwrap().get("joint"),
                    Some(&ImportDiagnosticDetailValue::String("J0".to_string()))
                );
                assert_eq!(
                    diagnostics[0].detail.as_ref().unwrap().get("jointIndex"),
                    Some(&ImportDiagnosticDetailValue::Number(0.0))
                );
                assert_eq!(document.skins[0].inverse_bind[0].m[0], 0.0);
                assert_eq!(document.skins[0].inverse_bind[0].m[15], 1.0);
            } else {
                assert!(diagnostics.is_empty());
            }
        }
    }

    #[test]
    fn builds_only_the_first_ordered_skeleton_and_reports_the_exact_dropped_skeleton_count() {
        let skeleton = skeleton_body("Rig", &[("Root", 0, IDENTITY_TRANSFORM)], false);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = create_scene3d_from_awd2(
            &Arc::new(RwLock::new(
                file(&[
                    block(AWD2_BLOCK_SKELETON, 0, 1, &skeleton),
                    block(AWD2_BLOCK_SKELETON, 0, 2, &skeleton),
                ])
                .into_boxed_slice(),
            )),
            &full_options(),
            Some(&diagnostics),
        );
        let mut children = Vec::new();
        get_node_children(&mut children, &(scene.root.clone() as NodeRef));
        assert_eq!(children.len(), 1);
        let diagnostics = diagnostics.read().unwrap();
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "awd2.multiple-skeletons");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(diagnostics[0].origin, "parseAwd2");
        assert_eq!(
            diagnostics[0].detail.as_ref().unwrap().get("skeletons"),
            Some(&ImportDiagnosticDetailValue::Number(2.0))
        );
    }

    #[test]
    fn leaves_static_and_rigid_meshes_unskinned_even_when_a_skeleton_is_present() {
        for with_skeleton in [false, true] {
            let positions = [0.0f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
                .iter()
                .flat_map(|value| value.to_le_bytes())
                .collect::<Vec<_>>();
            let indices = [0u16, 1, 2]
                .iter()
                .flat_map(|value| value.to_le_bytes())
                .collect::<Vec<_>>();
            let geometry = geometry_body(
                if with_skeleton { "Rigid" } else { "Geo" },
                &[vec![
                    geometry_stream(AWD2_STREAM_POSITIONS, AWD2_DATA_FLOAT32, &positions),
                    geometry_stream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, &indices),
                ]],
            );
            let mut blocks = vec![block(AWD2_BLOCK_TRIANGLE_GEOMETRY, 0, 1, &geometry)];
            if with_skeleton {
                blocks.push(block(
                    AWD2_BLOCK_SKELETON,
                    0,
                    2,
                    &skeleton_body("Rig", &[("Root", 0, IDENTITY_TRANSFORM)], false),
                ));
            }
            blocks.push(block(
                AWD2_BLOCK_MESH_INSTANCE,
                0,
                if with_skeleton { 3 } else { 2 },
                &mesh_body(if with_skeleton { "RigidMesh" } else { "Mesh" }, 1),
            ));
            let scene = create_scene3d_from_awd2(
                &Arc::new(RwLock::new(file(&blocks).into_boxed_slice())),
                &full_options(),
                None,
            );
            let mut children = Vec::new();
            get_node_children(&mut children, &(scene.root.clone() as NodeRef));
            assert!(!children.is_empty());
            let mesh = children
                .iter()
                .find(|node| node.read().unwrap().as_any().is::<Mesh>())
                .unwrap()
                .read()
                .unwrap();
            let mesh = mesh.as_any().downcast_ref::<Mesh>().unwrap();
            assert!(mesh.skin.is_none());
            assert_eq!(
                mesh.geometry.read().unwrap().layout.read().unwrap().stride,
                48
            );
            assert!(scene.animations.is_empty());
        }
    }

    #[test]
    fn preserves_the_source_full_document_when_the_explicit_handler_array_is_reversed() {
        let input = Arc::new(RwLock::new(skinned_triangle().into_boxed_slice()));
        let forward = parse_awd2(&input, &full_options(), None);
        let mut options = full_options();
        options.blocks.reverse();
        let reverse = parse_awd2(&input, &options, None);
        let forward = forward.read().unwrap();
        let reverse = reverse.read().unwrap();
        assert_eq!(reverse.nodes.len(), forward.nodes.len());
        assert_eq!(reverse.meshes.len(), forward.meshes.len());
        assert_eq!(reverse.skins.len(), forward.skins.len());
        assert_eq!(reverse.animations.len(), forward.animations.len());
        for (actual, expected) in reverse.nodes.iter().zip(&forward.nodes) {
            assert_eq!(actual.name, expected.name);
            assert_eq!(actual.kind, expected.kind);
        }
    }

    #[test]
    fn rebuilds_the_exact_source_skinned_fixture_through_the_real_inflater_and_preserves_mesh_skin_and_animation_counts()
     {
        let input = compressed_input(COMPRESSED_SKINNED_BODY);
        let original = skinned_triangle();
        let rehydrated =
            rehydrate_awd2_body(&input, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None, None).unwrap();
        assert_eq!(&**rehydrated.source.read().unwrap(), original.as_slice());
        let from_compressed = parse_awd2(&input, &full_options(), None);
        let from_original = parse_awd2(
            &Arc::new(RwLock::new(original.into_boxed_slice())),
            &full_options(),
            None,
        );
        let from_compressed = from_compressed.read().unwrap();
        let from_original = from_original.read().unwrap();
        assert_eq!(from_compressed.meshes.len(), from_original.meshes.len());
        assert_eq!(from_compressed.nodes.len(), from_original.nodes.len());
        assert_eq!(from_compressed.skins.len(), from_original.skins.len());
        assert_eq!(
            flight_meshgeometry::get_mesh_geometry_vertex_count(
                &from_compressed.meshes[0].geometry.read().unwrap()
            ),
            flight_meshgeometry::get_mesh_geometry_vertex_count(
                &from_original.meshes[0].geometry.read().unwrap()
            )
        );
    }

    #[test]
    fn routes_source_compressed_geometry_and_skeleton_animations_through_the_same_host_seam() {
        let original = skinned_triangle();
        let body = original[12..].to_vec();
        let mut payload = vec![0xde, 0xad, 0xbe, 0xef];
        payload.extend_from_slice(&body);
        let marker_input = compressed_input(&payload);
        let mut options = full_options();
        options.deflate = Some(Some(Arc::new(HostDecompressDeflateCapability {
            decompress: Arc::new(|bytes, _, framing| {
                assert_eq!(framing, CompressionFraming::Rfc1950);
                return Some(bytes[4..].to_vec().into_boxed_slice());
            }),
        })));
        let document = parse_awd2(&marker_input, &options, None);
        let uncompressed = parse_awd2(
            &Arc::new(RwLock::new(original.into_boxed_slice())),
            &full_options(),
            None,
        );
        let document = document.read().unwrap();
        let uncompressed = uncompressed.read().unwrap();
        assert_eq!(document.meshes.len(), uncompressed.meshes.len());
        assert_eq!(document.nodes.len(), uncompressed.nodes.len());
        assert_eq!(
            flight_meshgeometry::get_mesh_geometry_vertex_count(
                &document.meshes[0].geometry.read().unwrap()
            ),
            flight_meshgeometry::get_mesh_geometry_vertex_count(
                &uncompressed.meshes[0].geometry.read().unwrap()
            )
        );
        let mut skeleton_only = skeleton_options();
        skeleton_only.deflate = options.deflate.clone();
        assert_eq!(
            parse_awd2(&marker_input, &skeleton_only, None)
                .read()
                .unwrap()
                .animations[0]
                .channels
                .len(),
            4
        );
        let input = compressed_input(&vec![0; body.len()]);
        options.deflate = Some(Some(Arc::new(HostDecompressDeflateCapability {
            decompress: Arc::new(move |_, _, _| Some(body.clone().into_boxed_slice())),
        })));
        let scene = create_scene3d_from_awd2(&input, &options, None);
        assert_eq!(scene.animations.len(), 1);
        let mut children = Vec::new();
        get_node_children(&mut children, &(scene.root.clone() as NodeRef));
        let mesh = children
            .iter()
            .find(|node| node.read().unwrap().as_any().is::<Mesh>())
            .unwrap()
            .read()
            .unwrap();
        assert!(mesh.as_any().downcast_ref::<Mesh>().unwrap().skin.is_some());
    }

    #[test]
    fn retains_the_source_empty_scene_and_exact_reject_crumb_for_missing_and_failing_compressed_host_slots()
     {
        let mut payload = vec![0xde, 0xad, 0xbe, 0xef];
        payload.extend_from_slice(&skinned_triangle()[12..]);
        let input = compressed_input(&payload);
        for failing in [false, true] {
            let mut options = full_options();
            options.deflate = Some(if failing {
                Some(Arc::new(HostDecompressDeflateCapability {
                    decompress: Arc::new(|_, _, _| None),
                }))
            } else {
                None
            });
            let diagnostics = Arc::new(RwLock::new(Vec::new()));
            let scene = create_scene3d_from_awd2(&input, &options, Some(&diagnostics));
            let mut children = Vec::new();
            get_node_children(&mut children, &(scene.root.clone() as NodeRef));
            assert!(children.is_empty());
            let diagnostics = diagnostics.read().unwrap();
            assert_eq!(diagnostics.len(), 1);
            assert_eq!(
                diagnostics[0].kind,
                if failing {
                    "awd2.decompression-failed"
                } else {
                    "awd2.compression-no-decompressor"
                }
            );
            assert_eq!(diagnostics[0].origin, "rehydrateAwd2Body");
            assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Reject);
            assert_eq!(
                diagnostics[0].detail.as_ref().unwrap().get("compression"),
                Some(&ImportDiagnosticDetailValue::Number(
                    AWD2_COMPRESSION_DEFLATE as f32
                ))
            );
        }
    }

    #[test]
    fn binds_the_source_skinned_geometry_and_live_animation_targets_to_the_same_original_joint_nodes()
     {
        let bytes = Arc::new(RwLock::new(skinned_triangle().into_boxed_slice()));
        let document = parse_awd2(&bytes, &full_options(), None);
        let document = document.read().unwrap();
        assert_eq!(document.skins.len(), 1);
        assert_eq!(document.skins[0].joints.len(), 2);
        assert_eq!(document.skins[0].inverse_bind.len(), 2);
        for index in &document.skins[0].joints {
            assert!(*index >= 0 && (*index as usize) < document.nodes.len());
        }
        assert_eq!(document.meshes[0].skin, Some(0));
        assert_eq!(document.animations.len(), 1);
        let channels = &document.animations[0].channels;
        assert_eq!(channels.len(), 4);
        assert_eq!(channels[0].node, document.skins[0].joints[0]);
        assert_eq!(channels[2].node, document.skins[0].joints[1]);
        for channel in channels {
            assert!(document.skins[0].joints.contains(&channel.node));
        }
        let scene = create_scene3d_from_awd2(&bytes, &full_options(), None);
        let mut children = Vec::new();
        get_node_children(&mut children, &(scene.root.clone() as NodeRef));
        let mesh = children
            .iter()
            .find(|child| child.read().unwrap().as_any().is::<Mesh>())
            .unwrap()
            .read()
            .unwrap();
        let mesh = mesh.as_any().downcast_ref::<Mesh>().unwrap();
        let geometry = mesh.geometry.read().unwrap();
        assert_eq!(geometry.layout.read().unwrap().stride, 80);
        assert_eq!(&geometry.vertices[12..14], &[0.0, 1.0]);
        for (actual, expected) in geometry.vertices[16..18].iter().zip([0.75, 0.25]) {
            // D1 f32 bound (TS: 0.5e-2)
            assert!((*actual - expected).abs() <= 0.5e-2f32.max(4.0 * f32::EPSILON));
        }
        for vertex in geometry.vertices.chunks_exact(20) {
            let weight_sum = vertex[16] + vertex[17] + vertex[18] + vertex[19];
            // D1 f32 bound (TS: 0.5e-2)
            assert!((weight_sum - 1.0).abs() <= 0.5e-2f32.max(4.0 * f32::EPSILON));
        }
        let skin = mesh.skin.as_ref().unwrap().read().unwrap();
        assert!(skin.skeleton_root.is_none());
        let skeleton = skin.skeleton.read().unwrap();
        let joints = skeleton.joints.read().unwrap();
        assert_eq!(joints.len(), 2);
        assert_eq!(skeleton.names.as_ref().unwrap(), &["Root", "Child"]);
        assert!(
            children
                .iter()
                .any(|node| node.read().unwrap().node_fields().name.as_deref() == Some("skeleton"))
        );
        let parent = get_node_parent(&(joints[1].clone() as NodeRef)).unwrap();
        assert!(Arc::ptr_eq(&parent, &(joints[0].clone() as NodeRef)));
        assert_eq!(scene.animations.len(), 1);
        let clip = scene.animations.get("Walk").unwrap().read().unwrap();
        assert_eq!(clip.channels.len(), 4);
        for (channel, joint) in [0usize, 2].iter().zip(joints.iter()) {
            let target = clip.channels[*channel]
                .target_ref
                .as_ref()
                .unwrap()
                .downcast_ref::<Scene3DAnimationTarget>()
                .unwrap();
            assert!(Arc::ptr_eq(&target.node, joint));
        }
    }
}

mod awd2_skeleton_pose_handler {
    use super::*;

    #[test]
    fn claims_pose_blocks_with_deferred_parse_and_no_build_phase() {
        let handler = AWD2_SKELETON_POSE_HANDLER.read().unwrap();
        assert_eq!(handler.block_types, [AWD2_BLOCK_SKELETON_POSE]);
        assert_eq!(handler.deferred, Some(true));
        assert!(handler.build.is_none());
        assert_eq!(handler.build_phase, None);
    }

    #[test]
    fn parses_pose_transform_presence_and_both_wire_widths_and_replaces_duplicate_ids_in_place() {
        for wide in [false, true] {
            let mut transform = IDENTITY_TRANSFORM;
            transform[11] = 3.5;
            let mut state = create_state();
            invoke_parse(
                &AWD2_SKELETON_POSE_HANDLER,
                &mut state,
                9,
                &pose_body("First", &[Some(transform), None], wide),
                wide,
            );
            invoke_parse(
                &AWD2_SKELETON_POSE_HANDLER,
                &mut state,
                3,
                &pose_body("Other", &[], wide),
                wide,
            );
            assert_eq!(
                state.skeleton_poses[0].value.joint_transforms[0]
                    .as_ref()
                    .unwrap()[11],
                -3.5
            );
            assert!(state.skeleton_poses[0].value.joint_transforms[1].is_none());
            invoke_parse(
                &AWD2_SKELETON_POSE_HANDLER,
                &mut state,
                9,
                &pose_body("Replacement", &[], wide),
                wide,
            );
            assert_eq!(
                state
                    .skeleton_poses
                    .iter()
                    .map(|entry| entry.key)
                    .collect::<Vec<_>>(),
                [9, 3]
            );
            assert_eq!(state.skeleton_poses[0].value.name, "Replacement");
        }
    }

    #[test]
    fn preserves_complete_source_truncation_tables_on_the_public_scene_path_with_all_families() {
        let light = scene_header("", 0, &IDENTITY_TRANSFORM, false);
        let mut picker = awd_string("");
        picker.extend_from_slice(&1u16.to_le_bytes());
        picker.extend_from_slice(&1u32.to_le_bytes());
        let container = scene_header("", 0, &IDENTITY_TRANSFORM, false);
        let mesh = mesh_body("", 0);
        let mut material = awd_string("");
        material.extend_from_slice(&[AWD2_MATERIAL_TYPE_COLOR, 0]);
        material.extend_from_slice(&[0; 8]);
        let mut texture = awd_string("");
        texture.push(AWD2_TEXTURE_TYPE_EMBEDDED);
        texture.extend_from_slice(&8u32.to_le_bytes());
        texture.extend_from_slice(&[0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
        texture.extend_from_slice(&[0; 8]);
        let skeleton = skeleton_body("", &[("", 0, IDENTITY_TRANSFORM)], false);
        let pose = pose_body("", &[Some(IDENTITY_TRANSFORM)], false);
        let animation = animation_body("", &[(100, 1)]);
        for (kind, full, rows, origin, diagnostic_kind) in [
            (
                AWD2_BLOCK_LIGHT,
                light.as_slice(),
                vec![
                    (0, "parentId"),
                    (4, "transform"),
                    (52, "name"),
                    (54, "lightType"),
                ],
                "parseLightBlock",
                "awd2.light-truncated",
            ),
            (
                AWD2_BLOCK_LIGHT_PICKER,
                picker.as_slice(),
                vec![(0, "name"), (2, "numLights"), (4, "lightIds")],
                "parseLightPickerBlock",
                "awd2.light-picker-truncated",
            ),
            (
                AWD2_BLOCK_CONTAINER,
                container.as_slice(),
                vec![(0, "parentId"), (4, "transform"), (52, "name")],
                "parseContainerBlock",
                "awd2.container-truncated",
            ),
            (
                AWD2_BLOCK_MESH_INSTANCE,
                mesh.as_slice(),
                vec![
                    (0, "parentId"),
                    (4, "transform"),
                    (52, "name"),
                    (54, "geometryId"),
                ],
                "parseMeshInstanceBlock",
                "awd2.mesh-instance-truncated",
            ),
            (
                AWD2_BLOCK_MATERIAL,
                material.as_slice(),
                vec![(0, "name"), (2, "type")],
                "parseMaterialBlock",
                "awd2.material-truncated",
            ),
            (
                AWD2_BLOCK_TEXTURE,
                texture.as_slice(),
                vec![(0, "name"), (2, "payload"), (7, "data")],
                "parseTextureBlock",
                "awd2.texture-truncated",
            ),
            (
                AWD2_BLOCK_SKELETON,
                skeleton.as_slice(),
                vec![
                    (0, "name"),
                    (2, "jointCount"),
                    (8, "jointFields"),
                    (12, "jointName"),
                    (14, "jointTransform"),
                ],
                "parseSkeletonBlock",
                "awd2.skeleton-truncated",
            ),
            (
                AWD2_BLOCK_SKELETON_POSE,
                pose.as_slice(),
                vec![
                    (0, "name"),
                    (2, "jointCount"),
                    (8, "hasTransform"),
                    (9, "jointTransform"),
                ],
                "parseSkeletonPoseBlock",
                "awd2.skeleton-pose-truncated",
            ),
            (
                AWD2_BLOCK_SKELETON_ANIMATION,
                animation.as_slice(),
                vec![
                    (0, "name"),
                    (2, "frameCount"),
                    (8, "poseBlockId"),
                    (12, "poseDuration"),
                ],
                "parseSkeletonAnimationBlock",
                "awd2.skeleton-animation-truncated",
            ),
        ] {
            for (cut, field) in rows {
                let mut blocks = Vec::new();
                if kind == AWD2_BLOCK_SKELETON_POSE || kind == AWD2_BLOCK_SKELETON_ANIMATION {
                    blocks.push(block(
                        AWD2_BLOCK_SKELETON,
                        0,
                        1,
                        &skeleton_body("Rig", &[("Root", 0, IDENTITY_TRANSFORM)], false),
                    ));
                }
                blocks.push(block(kind, 0, 2, &full[..cut]));
                let diagnostics = Arc::new(RwLock::new(Vec::new()));
                create_scene3d_from_awd2(
                    &Arc::new(RwLock::new(file(&blocks).into_boxed_slice())),
                    &full_options(),
                    Some(&diagnostics),
                );
                let diagnostics = diagnostics.read().unwrap();
                assert_eq!(diagnostics.len(), 1, "{diagnostic_kind}:{field}");
                let diagnostic = &diagnostics[0];
                assert_eq!(diagnostic.kind, diagnostic_kind);
                assert_eq!(diagnostic.severity, ImportDiagnosticSeverity::Drop);
                assert_eq!(diagnostic.origin, origin);
                let detail = diagnostic.detail.as_ref().unwrap();
                assert_eq!(
                    detail.get("field"),
                    Some(&ImportDiagnosticDetailValue::String(field.to_string()))
                );
                let bytes = if kind == AWD2_BLOCK_TEXTURE && field == "data" {
                    Some(8.0)
                } else {
                    None
                };
                let lights = if kind == AWD2_BLOCK_LIGHT_PICKER && field == "lightIds" {
                    Some(1.0)
                } else {
                    None
                };
                assert_eq!(
                    detail.get("bytes"),
                    bytes.map(ImportDiagnosticDetailValue::Number).as_ref()
                );
                assert_eq!(
                    detail.get("lights"),
                    lights.map(ImportDiagnosticDetailValue::Number).as_ref()
                );
                assert_eq!(
                    detail.len(),
                    1 + bytes.is_some() as usize + lights.is_some() as usize
                );
            }
        }
    }
}
