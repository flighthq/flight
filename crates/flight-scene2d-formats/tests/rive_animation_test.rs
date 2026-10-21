use std::collections::HashMap;
use std::sync::Arc;

use flight_animation::sample_animation_track;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_scene2d::{
    create_display_object, Node2DAnimationPath, Node2DAnimationTarget, Node2DRef,
};
use flight_scene2d_formats::contract::*;
use flight_skeleton2d::contract::{
    Skeleton2DAnimationTarget, Skeleton2DAnimationTargetHandle,
    SKELETON_2D_ANIMATION_PATH_ROTATION, SKELETON_2D_ANIMATION_PATH_SCALE_X,
    SKELETON_2D_ANIMATION_PATH_SCALE_Y, SKELETON_2D_ANIMATION_PATH_TRANSLATION_X,
    SKELETON_2D_ANIMATION_PATH_TRANSLATION_Y,
};

const ARTBOARD: u64 = 1;
const SHAPE: u64 = 3;
const LINEAR_ANIMATION: u64 = 31;
const KEYED_OBJECT: u64 = 25;
const KEYED_PROPERTY: u64 = 26;
const KEYFRAME_DOUBLE: u64 = 30;
const KEYFRAME_COLOR: u64 = 37;
const KEYFRAME_BOOL: u64 = 84;
const ROOT_BONE: u64 = 41;
const CUBIC_INTERPOLATOR: u64 = 139;
const ELASTIC_INTERPOLATOR: u64 = 174;
const SCRIPTED_INTERPOLATOR: u64 = 972;

const OBJECT_ID: u64 = 51;
const PROPERTY_KEY: u64 = 53;
const NAME: u64 = 55;
const FPS: u64 = 56;
const DURATION: u64 = 57;
const SPEED: u64 = 58;
const LOOP: u64 = 59;
const WORK_START: u64 = 60;
const WORK_END: u64 = 61;
const ENABLE_WORK_AREA: u64 = 62;
const FRAME: u64 = 67;
const INTERPOLATION: u64 = 68;
const INTERPOLATOR_ID: u64 = 69;
const VALUE: u64 = 70;
const COLOR_VALUE: u64 = 88;
const ROTATION: u64 = 15;
const SCALE_X: u64 = 16;
const ROOT_X: u64 = 90;
const EASING: u64 = 405;
const AMPLITUDE: u64 = 406;
const PERIOD: u64 = 407;

mod apply_animation_clip_to_rive_document {
    use super::*;

    #[test]
    fn applies_every_shared_transform_path_to_the_keyed_node() {
        let cases = [
            (13, Node2DAnimationPath::X, 10.0, 30.0, 20.0),
            (9, Node2DAnimationPath::X, 10.0, 30.0, 20.0),
            (14, Node2DAnimationPath::Y, 10.0, 30.0, 20.0),
            (10, Node2DAnimationPath::Y, 10.0, 30.0, 20.0),
            (
                15,
                Node2DAnimationPath::Rotation,
                0.0,
                std::f32::consts::PI,
                90.0,
            ),
            (16, Node2DAnimationPath::ScaleX, 1.0, 3.0, 2.0),
            (17, Node2DAnimationPath::ScaleY, 1.0, 3.0, 2.0),
            (18, Node2DAnimationPath::Alpha, 1.0, 0.5, 0.75),
        ];
        for (key, path, from, to, expected) in cases {
            let node: Node2DRef = create_display_object(None);
            let clips = build(
                1.0,
                key,
                &[(0.0, 1.0, from), (1.0, 1.0, to)],
                vec![Some(node.clone())],
                0,
                None,
            );
            apply_animation_clip_to_rive_document(&clips[0].clip, 0.5);
            let node = node.read().unwrap();
            let actual = match path {
                Node2DAnimationPath::X => node.node2d_fields().x,
                Node2DAnimationPath::Y => node.node2d_fields().y,
                Node2DAnimationPath::Rotation => node.node2d_fields().rotation,
                Node2DAnimationPath::ScaleX => node.node2d_fields().scale_x,
                Node2DAnimationPath::ScaleY => node.node2d_fields().scale_y,
                Node2DAnimationPath::Alpha => node.node2d_fields().alpha,
                _ => unreachable!(),
            };
            assert_f32(actual, expected);
        }
    }
}

mod create_rive_animation_clips {
    use super::*;

    #[test]
    fn returns_nothing_when_the_range_holds_no_animation() {
        assert!(create_rive_animation_clips(
            &[object(KEYED_OBJECT, vec![])],
            RiveObjectRange { end: 1, start: 0 },
            &[],
            &empty_artboard(),
            &HashMap::new(),
            None,
            None,
        )
        .is_empty());
    }

    #[test]
    fn names_each_clip_and_takes_its_duration_from_its_own_frame_rate() {
        let objects = vec![
            object(
                LINEAR_ANIMATION,
                vec![
                    number(FPS, 30.0),
                    number(DURATION, 60.0),
                    text(NAME, "walk"),
                ],
            ),
            object(
                LINEAR_ANIMATION,
                vec![
                    number(FPS, 24.0),
                    number(DURATION, 12.0),
                    text(NAME, "blink"),
                ],
            ),
        ];
        let clips = clips(&objects, &[], None, None);
        assert_eq!(
            clips
                .iter()
                .map(|clip| clip.name.as_str())
                .collect::<Vec<_>>(),
            vec!["walk", "blink"]
        );
        assert_f32(clips[0].clip.duration, 2.0);
        assert_f32(clips[1].clip.duration, 0.5);
    }

    #[test]
    fn carries_every_loop_mode_the_format_states() {
        let actual = [0.0, 1.0, 2.0].map(|value| {
            let objects = vec![object(LINEAR_ANIMATION, vec![number(LOOP, value)])];
            clips(&objects, &[], None, None)[0].r#loop
        });
        assert_eq!(
            actual,
            [
                RiveAnimationLoop::OneShot,
                RiveAnimationLoop::Loop,
                RiveAnimationLoop::PingPong
            ]
        );
    }

    #[test]
    fn reports_an_unknown_loop_and_substitutes_one_shot() {
        let objects = vec![object(LINEAR_ANIMATION, vec![number(LOOP, 99.0)])];
        let mut diagnostics = Vec::new();
        let result = clips(&objects, &[], None, Some(&mut diagnostics));
        assert_eq!(result[0].r#loop, RiveAnimationLoop::OneShot);
        assert_diagnostic(
            &diagnostics,
            0,
            "rive.animation-loop-substituted",
            ImportDiagnosticSeverity::Recover,
        );
        assert_detail_number(&diagnostics[0], "loopValue", 99.0);
        assert_detail_string(&diagnostics[0], "substitutedAs", "oneShot");
    }

    #[test]
    fn stays_silent_for_a_genuine_one_shot() {
        let objects = vec![object(LINEAR_ANIMATION, vec![number(LOOP, 0.0)])];
        let mut diagnostics = Vec::new();
        assert_eq!(
            clips(&objects, &[], None, Some(&mut diagnostics))[0].r#loop,
            RiveAnimationLoop::OneShot
        );
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn carries_speed_and_enabled_work_area_using_animation_seconds() {
        let objects = vec![object(
            LINEAR_ANIMATION,
            vec![
                number(FPS, 30.0),
                number(SPEED, 2.5),
                number(ENABLE_WORK_AREA, 1.0),
                number(WORK_START, 15.0),
                number(WORK_END, 60.0),
            ],
        )];
        let result = clips(&objects, &[], None, None);
        assert_f32(result[0].speed, 2.5);
        assert_f32(result[0].work_area_start.unwrap(), 0.5);
        assert_f32(result[0].work_area_end.unwrap(), 2.0);

        let disabled = vec![object(
            LINEAR_ANIMATION,
            vec![
                number(FPS, 30.0),
                number(WORK_START, 15.0),
                number(WORK_END, 60.0),
            ],
        )];
        let result = clips(&disabled, &[], None, None);
        assert_f32(result[0].speed, 1.0);
        assert_eq!(result[0].work_area_start, None);
        assert_eq!(result[0].work_area_end, None);
    }

    #[test]
    fn leaves_an_unset_work_area_bound_absent_instead_of_frame_zero() {
        let objects = vec![object(
            LINEAR_ANIMATION,
            vec![
                number(FPS, 30.0),
                number(ENABLE_WORK_AREA, 1.0),
                number(WORK_END, 60.0),
            ],
        )];
        let result = clips(&objects, &[], None, None);
        assert_eq!(result[0].work_area_start, None);
        assert_f32(result[0].work_area_end.unwrap(), 2.0);
    }

    #[test]
    fn resolves_an_elastic_interpolator_instead_of_falling_back_to_linear() {
        let result = build_with_interpolator(
            ELASTIC_INTERPOLATOR,
            vec![
                number(AMPLITUDE, 1.0),
                number(PERIOD, 0.4),
                number(EASING, 1.0),
            ],
            None,
        );
        assert_f32(sampled(&result[0], 0.5), 100.0);
    }

    #[test]
    fn reports_each_keyframe_whose_interpolator_it_cannot_resolve() {
        let mut diagnostics = Vec::new();
        let result = build(
            1.0,
            13,
            &[(0.0, 2.0, 0.0), (1.0, 2.0, 100.0)],
            one_node(),
            0,
            Some(&mut diagnostics),
        );
        assert_eq!(result[0].clip.channels.len(), 1);
        assert_eq!(diagnostics.len(), 2);
        for diagnostic in &diagnostics {
            assert_eq!(diagnostic.kind, "rive.keyframe-easing-substituted");
            assert_eq!(diagnostic.severity, ImportDiagnosticSeverity::Recover);
            assert_detail_number(diagnostic, "interpolatorId", -1.0);
        }
    }

    #[test]
    fn stays_silent_for_hold_and_linear_which_name_no_interpolator() {
        let mut diagnostics = Vec::new();
        let held = build(
            1.0,
            13,
            &[(0.0, 0.0, 0.0), (1.0, 0.0, 100.0)],
            one_node(),
            0,
            Some(&mut diagnostics),
        );
        assert_f32(sampled(&held[0], 0.5), 0.0);
        assert!(diagnostics.is_empty());
        let linear = build(
            1.0,
            13,
            &[(0.0, 1.0, 0.0), (1.0, 1.0, 100.0)],
            one_node(),
            0,
            Some(&mut diagnostics),
        );
        assert_f32(sampled(&linear[0], 0.5), 50.0);
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn reports_an_elastic_easing_mode_it_does_not_know() {
        let mut diagnostics = Vec::new();
        let result = build_with_interpolator(
            ELASTIC_INTERPOLATOR,
            vec![number(EASING, 99.0)],
            Some(&mut diagnostics),
        );
        assert_eq!(result[0].clip.channels.len(), 1);
        assert_diagnostic(
            &diagnostics,
            0,
            "rive.elastic-easing-substituted",
            ImportDiagnosticSeverity::Recover,
        );
        assert_detail_string(&diagnostics[0], "substitutedAs", "easeOut");
    }

    #[test]
    fn stays_silent_for_every_elastic_easing_the_format_states() {
        for mode in [0.0, 1.0, 2.0] {
            let mut diagnostics = Vec::new();
            let result = build_with_interpolator(
                ELASTIC_INTERPOLATOR,
                vec![number(EASING, mode)],
                Some(&mut diagnostics),
            );
            assert_eq!(result[0].clip.channels.len(), 1);
            assert!(diagnostics.is_empty());
        }
    }

    #[test]
    fn uses_the_authored_elastic_amplitude_and_period() {
        let narrow = build_with_interpolator(
            ELASTIC_INTERPOLATOR,
            vec![
                number(AMPLITUDE, 1.0),
                number(PERIOD, 0.4),
                number(EASING, 1.0),
            ],
            None,
        );
        let wide = build_with_interpolator(
            ELASTIC_INTERPOLATOR,
            vec![
                number(AMPLITUDE, 2.0),
                number(PERIOD, 0.8),
                number(EASING, 1.0),
            ],
            None,
        );
        assert!((sampled(&narrow[0], 0.1) - sampled(&wide[0], 0.1)).abs() > 1.0);
    }

    #[test]
    fn falls_back_to_linear_for_a_scripted_interpolator() {
        let result = build_with_interpolator(SCRIPTED_INTERPOLATOR, vec![], None);
        assert_f32(sampled(&result[0], 0.5), 50.0);
    }

    #[test]
    fn binds_a_bone_rotation_channel_against_the_flattened_rig() {
        let (clips, skeleton) =
            build_bone_property(ROTATION, std::f32::consts::FRAC_PI_2, 0.0, 0.0, 1.0, None);
        let target = skeleton_target(&clips[0]);
        assert_eq!(target.bone_index, skeleton.bone_indices[1]);
        assert_eq!(target.path, SKELETON_2D_ANIMATION_PATH_ROTATION);
    }

    #[test]
    fn converts_absolute_bone_values_into_relative_binder_values() {
        let (rotation, _) = build_bone_property(
            ROTATION,
            std::f32::consts::PI,
            std::f32::consts::FRAC_PI_2,
            0.0,
            1.0,
            None,
        );
        assert_f32(sampled(&rotation[0], 1.0), 90.0);
        let (translation, _) = build_bone_property(13, 30.0, 0.0, 12.0, 1.0, None);
        assert_f32(sampled(&translation[0], 1.0), 18.0);
        let (scale, _) = build_bone_property(SCALE_X, 3.0, 0.0, 0.0, 2.0, None);
        assert_f32(sampled(&scale[0], 1.0), 1.5);
    }

    #[test]
    fn binds_each_bone_axis_to_its_own_per_axis_path() {
        let cases = [
            (13, SKELETON_2D_ANIMATION_PATH_TRANSLATION_X),
            (14, SKELETON_2D_ANIMATION_PATH_TRANSLATION_Y),
            (15, SKELETON_2D_ANIMATION_PATH_ROTATION),
            (16, SKELETON_2D_ANIMATION_PATH_SCALE_X),
            (17, SKELETON_2D_ANIMATION_PATH_SCALE_Y),
        ];
        for (key, expected) in cases {
            let (clips, _) = build_bone_property(key, 1.0, 0.0, 0.0, 1.0, None);
            assert_eq!(skeleton_target(&clips[0]).path, expected);
        }
    }

    #[test]
    fn drops_an_unrepresentable_zero_setup_scale_and_reports_it() {
        let mut diagnostics = Vec::new();
        let (clips, _) = build_bone_property(SCALE_X, 3.0, 0.0, 0.0, 0.0, Some(&mut diagnostics));
        assert!(clips[0].clip.channels.is_empty());
        assert_diagnostic(
            &diagnostics,
            0,
            "rive.unrepresentable-bone-scale",
            ImportDiagnosticSeverity::Drop,
        );
    }

    #[test]
    fn places_keyframes_at_frame_over_fps_seconds() {
        let result = build(
            30.0,
            13,
            &[(0.0, 1.0, 10.0), (15.0, 1.0, 20.0), (30.0, 1.0, 40.0)],
            one_node(),
            0,
            None,
        );
        let track = result[0].clip.channels[0].track.read().unwrap();
        assert_eq!(track.times, vec![0.0, 0.5, 1.0]);
        assert_eq!(track.values, vec![10.0, 20.0, 40.0]);
    }

    #[test]
    fn binds_each_keyed_property_to_the_named_node_and_shared_path() {
        let node: Node2DRef = create_display_object(None);
        let result = build(
            30.0,
            13,
            &[(0.0, 1.0, 5.0)],
            vec![None, Some(node.clone())],
            1,
            None,
        );
        let target = result[0].clip.channels[0]
            .target_ref
            .as_ref()
            .unwrap()
            .downcast_ref::<Node2DAnimationTarget>()
            .unwrap();
        assert!(Arc::ptr_eq(&target.node, &node));
        assert_eq!(target.path, Node2DAnimationPath::X);
    }

    #[test]
    fn maps_the_shared_transform_properties_and_requires_an_owning_shape_for_content() {
        let cases = [
            (13, Node2DAnimationPath::X),
            (9, Node2DAnimationPath::X),
            (14, Node2DAnimationPath::Y),
            (10, Node2DAnimationPath::Y),
            (15, Node2DAnimationPath::Rotation),
            (16, Node2DAnimationPath::ScaleX),
            (17, Node2DAnimationPath::ScaleY),
            (18, Node2DAnimationPath::Alpha),
        ];
        for (key, expected) in cases {
            let result = build(30.0, key, &[(0.0, 1.0, 1.0)], one_node(), 0, None);
            let target = result[0].clip.channels[0]
                .target_ref
                .as_ref()
                .unwrap()
                .downcast_ref::<Node2DAnimationTarget>()
                .unwrap();
            assert_eq!(target.path, expected);
        }
        assert!(build(30.0, 24, &[(0.0, 1.0, 1.0)], one_node(), 0, None)[0]
            .clip
            .channels
            .is_empty());
    }

    #[test]
    fn converts_an_animated_rotation_from_radians_into_degrees() {
        let result = build(
            30.0,
            ROTATION,
            &[(0.0, 1.0, 0.0), (30.0, 1.0, std::f32::consts::PI)],
            one_node(),
            0,
            None,
        );
        assert_f32(
            result[0].clip.channels[0].track.read().unwrap().values[1],
            180.0,
        );
    }

    #[test]
    fn applies_the_cubic_interpolator_a_keyframe_names() {
        let objects = vec![
            object(
                LINEAR_ANIMATION,
                vec![number(FPS, 30.0), number(DURATION, 30.0)],
            ),
            object(
                CUBIC_INTERPOLATOR,
                vec![
                    number(63, 0.9),
                    number(64, 0.0),
                    number(65, 1.0),
                    number(66, 0.1),
                ],
            ),
            object(KEYED_OBJECT, vec![number(OBJECT_ID, 0.0)]),
            object(KEYED_PROPERTY, vec![number(PROPERTY_KEY, 13.0)]),
            keyframe(0.0, 2.0, 0.0, Some(1.0)),
            keyframe(30.0, 2.0, 100.0, Some(1.0)),
        ];
        let result = clips(&objects, &one_node(), None, None);
        assert!((sampled(&result[0], 0.5) - 2.4016184).abs() <= 0.0001);
    }

    #[test]
    fn drops_a_repeated_frame_in_favour_of_the_first_value() {
        let result = build(
            30.0,
            13,
            &[(0.0, 1.0, 0.0), (0.0, 1.0, 99.0), (30.0, 1.0, 100.0)],
            one_node(),
            0,
            None,
        );
        let track = result[0].clip.channels[0].track.read().unwrap();
        assert_eq!(track.times, vec![0.0, 1.0]);
        assert_eq!(track.values, vec![0.0, 100.0]);
    }

    #[test]
    fn reports_a_keyed_object_whose_whole_property_run_bound_nothing() {
        let mut diagnostics = Vec::new();
        let result = build(
            30.0,
            13,
            &[(0.0, 1.0, 1.0)],
            vec![],
            5,
            Some(&mut diagnostics),
        );
        assert!(result[0].clip.channels.is_empty());
        assert_diagnostic(
            &diagnostics,
            0,
            "rive.keyed-object-unbound",
            ImportDiagnosticSeverity::Drop,
        );
        assert_detail_number(&diagnostics[0], "objectId", 5.0);
        assert_detail_number(&diagnostics[0], "properties", 1.0);
    }

    #[test]
    fn does_not_read_an_unsupported_keyframe_kind_as_a_double_or_double_report_it() {
        let objects = vec![
            object(LINEAR_ANIMATION, vec![number(FPS, 30.0)]),
            object(KEYED_OBJECT, vec![number(OBJECT_ID, 1.0)]),
            object(KEYED_PROPERTY, vec![number(PROPERTY_KEY, 41.0)]),
            object(KEYFRAME_BOOL, vec![number(FRAME, 0.0), number(VALUE, 1.0)]),
        ];
        let artboard = RiveArtboardGraph {
            objects: vec![object(ARTBOARD, vec![]), object(SHAPE, vec![])],
            parent_indices: vec![-1, 0],
            stream_end: 2,
            stream_start: 0,
        };
        let mut rebuilds = HashMap::new();
        rebuilds.insert(1, Arc::new(|| {}) as RiveRebuild);
        let mut diagnostics = Vec::new();
        let result = create_rive_animation_clips(
            &objects,
            RiveObjectRange {
                end: objects.len(),
                start: 0,
            },
            &[None, Some(create_display_object(None))],
            &artboard,
            &rebuilds,
            None,
            Some(&mut diagnostics),
        );
        assert!(result[0].clip.channels.is_empty());
        assert_eq!(diagnostics.len(), 1);
        assert_diagnostic(
            &diagnostics,
            0,
            "rive.keyframe-kind-unsupported",
            ImportDiagnosticSeverity::Drop,
        );
    }

    #[test]
    fn stays_silent_for_a_bone_that_binds_through_the_rig() {
        let mut diagnostics = Vec::new();
        let (clips, _) = build_bone_property(ROTATION, 0.5, 0.0, 0.0, 1.0, Some(&mut diagnostics));
        assert!(!clips[0].clip.channels.is_empty());
        assert!(diagnostics
            .iter()
            .all(|entry| entry.kind != "rive.keyed-object-unbound"));
    }

    #[test]
    fn stays_silent_for_a_keyed_property_with_no_keyframe() {
        let objects = vec![
            object(LINEAR_ANIMATION, vec![number(FPS, 30.0)]),
            object(KEYED_OBJECT, vec![number(OBJECT_ID, 5.0)]),
            object(KEYED_PROPERTY, vec![number(PROPERTY_KEY, 41.0)]),
        ];
        let mut diagnostics = Vec::new();
        assert_eq!(clips(&objects, &[], None, Some(&mut diagnostics)).len(), 1);
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn reads_color_keyframes_as_four_argb_components_and_queues_one_rebuild() {
        let objects = vec![
            object(
                LINEAR_ANIMATION,
                vec![number(FPS, 1.0), number(DURATION, 1.0)],
            ),
            object(KEYED_OBJECT, vec![number(OBJECT_ID, 2.0)]),
            object(KEYED_PROPERTY, vec![number(PROPERTY_KEY, 37.0)]),
            color_keyframe(0.0, 0x40102030),
            color_keyframe(1.0, 0xc0506070),
        ];
        let artboard = RiveArtboardGraph {
            objects: vec![
                object(ARTBOARD, vec![]),
                object(SHAPE, vec![]),
                object(18, vec![color(37, 0x40102030)]),
            ],
            parent_indices: vec![-1, 0, 1],
            stream_end: 3,
            stream_start: 0,
        };
        let rebuild_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let count = rebuild_count.clone();
        let rebuild: RiveRebuild = Arc::new(move || {
            count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        });
        let result = create_rive_animation_clips(
            &objects,
            RiveObjectRange {
                end: objects.len(),
                start: 0,
            },
            &[],
            &artboard,
            &HashMap::from([(1, rebuild)]),
            None,
            None,
        );
        assert_eq!(
            result[0].clip.channels[0].track.read().unwrap().components,
            4
        );
        apply_animation_clip_to_rive_document(&result[0].clip, 0.5);
        assert_eq!(rebuild_count.load(std::sync::atomic::Ordering::SeqCst), 1);
    }
}

mod register_rive_animation_handlers {
    use super::*;

    #[test]
    fn claims_linear_animation_as_an_artboard_pass() {
        let mut registry = create_rive_import_registry();
        register_rive_animation_handlers(&mut registry);
        let handler = get_rive_core_object_handler(&registry, LINEAR_ANIMATION as i32).unwrap();
        assert!(handler.apply_artboard.is_some());
        assert!(handler.apply_document.is_none());
        assert!(handler.import_component.is_none());
    }
}

fn assert_detail_number(diagnostic: &ImportDiagnostic, key: &str, expected: f32) {
    let Some(ImportDiagnosticDetailValue::Number(actual)) =
        diagnostic.detail.as_ref().unwrap().get(key)
    else {
        panic!("expected numeric diagnostic detail {key}");
    };
    assert_f32(*actual, expected);
}

fn assert_detail_string(diagnostic: &ImportDiagnostic, key: &str, expected: &str) {
    let Some(ImportDiagnosticDetailValue::String(actual)) =
        diagnostic.detail.as_ref().unwrap().get(key)
    else {
        panic!("expected string diagnostic detail {key}");
    };
    assert_eq!(actual, expected);
}

fn assert_diagnostic(
    diagnostics: &[ImportDiagnostic],
    index: usize,
    kind: &str,
    severity: ImportDiagnosticSeverity,
) {
    assert_eq!(diagnostics[index].kind, kind);
    assert_eq!(diagnostics[index].severity, severity);
}

fn assert_f32(actual: f32, expected: f32) {
    // D1 f32 bound (TS: 0)
    let bound = 4.0 * f32::EPSILON * expected.abs().max(1.0);
    assert!(
        (actual - expected).abs() <= bound,
        "expected {expected}, got {actual} (bound {bound})"
    );
}

fn build(
    fps: f32,
    property_key: u64,
    frames: &[(f32, f32, f32)],
    nodes: Vec<Option<Node2DRef>>,
    object_id: i32,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<RiveAnimationClip> {
    let mut objects = vec![
        object(
            LINEAR_ANIMATION,
            vec![number(FPS, fps), number(DURATION, 60.0)],
        ),
        object(KEYED_OBJECT, vec![number(OBJECT_ID, object_id as f32)]),
        object(
            KEYED_PROPERTY,
            vec![number(PROPERTY_KEY, property_key as f32)],
        ),
    ];
    objects.extend(
        frames
            .iter()
            .map(|(frame, interpolation, value)| keyframe(*frame, *interpolation, *value, None)),
    );
    return clips(&objects, &nodes, None, diagnostics);
}

fn build_bone_property<'a>(
    property_key: u64,
    value: f32,
    setup_rotation: f32,
    setup_x: f32,
    setup_scale_x: f32,
    diagnostics: Option<&'a mut Vec<ImportDiagnostic>>,
) -> (Vec<RiveAnimationClip>, RiveSkeleton2DImport) {
    let objects = vec![
        object(ARTBOARD, vec![]),
        object(
            ROOT_BONE,
            vec![
                number(ROTATION, setup_rotation),
                number(ROOT_X, setup_x),
                number(SCALE_X, setup_scale_x),
            ],
        ),
        object(
            LINEAR_ANIMATION,
            vec![number(FPS, 1.0), number(DURATION, 1.0)],
        ),
        object(KEYED_OBJECT, vec![number(OBJECT_ID, 1.0)]),
        object(
            KEYED_PROPERTY,
            vec![number(PROPERTY_KEY, property_key as f32)],
        ),
        keyframe(0.0, 1.0, value, None),
        keyframe(1.0, 1.0, value, None),
    ];
    let artboard = RiveArtboardGraph {
        objects: objects.clone(),
        parent_indices: vec![-1, 0, -1, -1, -1, -1, -1],
        stream_end: objects.len(),
        stream_start: 0,
    };
    let skeleton = create_rive_skeleton_2d(&artboard).unwrap();
    let clips = create_rive_animation_clips(
        &objects,
        RiveObjectRange {
            end: objects.len(),
            start: 2,
        },
        &[],
        &artboard,
        &HashMap::new(),
        Some(&skeleton),
        diagnostics,
    );
    return (clips, skeleton);
}

fn build_with_interpolator(
    type_key: u64,
    properties: Vec<RiveProperty>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<RiveAnimationClip> {
    let objects = vec![
        object(type_key, properties),
        object(
            LINEAR_ANIMATION,
            vec![number(FPS, 1.0), number(DURATION, 1.0)],
        ),
        object(KEYED_OBJECT, vec![number(OBJECT_ID, 0.0)]),
        object(KEYED_PROPERTY, vec![number(PROPERTY_KEY, 13.0)]),
        keyframe(0.0, 2.0, 0.0, Some(0.0)),
        keyframe(1.0, 2.0, 100.0, Some(0.0)),
    ];
    return clips(&objects, &one_node(), None, diagnostics);
}

fn clips(
    objects: &[RiveCoreObject],
    nodes: &[Option<Node2DRef>],
    skeleton: Option<&RiveSkeleton2DImport>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Vec<RiveAnimationClip> {
    return create_rive_animation_clips(
        objects,
        RiveObjectRange {
            end: objects.len(),
            start: 0,
        },
        nodes,
        &empty_artboard(),
        &HashMap::new(),
        skeleton,
        diagnostics,
    );
}

fn color(key: u64, value: u32) -> RiveProperty {
    return RiveProperty {
        key,
        r#type: RiveFieldType::Color,
        value: RiveValue::Color(value),
    };
}

fn color_keyframe(frame: f32, value: u32) -> RiveCoreObject {
    return object(
        KEYFRAME_COLOR,
        vec![
            number(FRAME, frame),
            number(INTERPOLATION, 1.0),
            color(COLOR_VALUE, value),
        ],
    );
}

fn empty_artboard() -> RiveArtboardGraph {
    return RiveArtboardGraph {
        objects: Vec::new(),
        parent_indices: Vec::new(),
        stream_end: 0,
        stream_start: 0,
    };
}

fn keyframe(
    frame: f32,
    interpolation: f32,
    value: f32,
    interpolator: Option<f32>,
) -> RiveCoreObject {
    let mut properties = vec![
        number(FRAME, frame),
        number(INTERPOLATION, interpolation),
        number(VALUE, value),
    ];
    if let Some(interpolator) = interpolator {
        properties.push(number(INTERPOLATOR_ID, interpolator));
    }
    return object(KEYFRAME_DOUBLE, properties);
}

fn number(key: u64, value: f32) -> RiveProperty {
    return RiveProperty {
        key,
        r#type: RiveFieldType::Double,
        value: RiveValue::Double(value),
    };
}

fn object(type_key: u64, properties: Vec<RiveProperty>) -> RiveCoreObject {
    return RiveCoreObject {
        properties,
        type_key,
    };
}

fn one_node() -> Vec<Option<Node2DRef>> {
    return vec![Some(create_display_object(None))];
}

fn sampled(clip: &RiveAnimationClip, time: f32) -> f32 {
    let mut sample = [0.0_f32; 8];
    sample_animation_track(
        &mut sample,
        &clip.clip.channels[0].track.read().unwrap(),
        time,
    );
    return sample[0];
}

fn skeleton_target(clip: &RiveAnimationClip) -> &Skeleton2DAnimationTarget {
    let handle = clip.clip.channels[0]
        .target_ref
        .as_ref()
        .unwrap()
        .downcast_ref::<Skeleton2DAnimationTargetHandle>()
        .unwrap();
    return handle
        .target
        .as_ref()
        .unwrap()
        .downcast_ref::<Skeleton2DAnimationTarget>()
        .unwrap();
}

fn text(key: u64, value: &str) -> RiveProperty {
    return RiveProperty {
        key,
        r#type: RiveFieldType::String,
        value: RiveValue::String(value.to_string()),
    };
}
