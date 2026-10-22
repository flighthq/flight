use super::md5_test_helper::*;
use flight_animation::{AnimationChannel, AnimationInterpolation, sample_animation_track};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_scene3d::{
    Node3DFields, Node3DRef, Scene3DAnimationPath, Scene3DAnimationTarget, create_node3d,
    publish_node3d,
};
use flight_scene3d_formats::*;
use std::sync::Arc;

fn make_joints(names: &[Option<&str>]) -> Vec<Node3DRef> {
    return names
        .iter()
        .map(|name| {
            let mut joint: Node3DFields = create_node3d(None);
            joint.name = name.map(str::to_string);
            let joint: Node3DRef = publish_node3d(joint);
            return joint;
        })
        .collect();
}

fn target(channel: &AnimationChannel) -> &Scene3DAnimationTarget {
    return channel
        .target_ref
        .as_ref()
        .unwrap()
        .downcast_ref::<Scene3DAnimationTarget>()
        .unwrap();
}

fn sample(channel: &AnimationChannel, time: f32) -> Vec<f32> {
    let track = channel.track.read().unwrap();
    let mut out = vec![0.0; track.components];
    sample_animation_track(&mut out, &track, time);
    return out;
}

fn number(diagnostic: &ImportDiagnostic, key: &str) -> f32 {
    let ImportDiagnosticDetailValue::Number(value) =
        diagnostic.detail.as_ref().unwrap().get(key).unwrap()
    else {
        panic!("numeric {key}");
    };
    return *value;
}

fn diagnostic<'a>(diagnostics: &'a [ImportDiagnostic], kind: &str) -> &'a ImportDiagnostic {
    return diagnostics
        .iter()
        .find(|value| value.kind == kind)
        .unwrap_or_else(|| panic!("missing {kind}"));
}

mod parse_md5_anim {
    use super::*;

    #[test]
    fn static_joint_channels_use_original_nodes_paths_baseframe_axis_conversion_and_exact_bounds_skip()
     {
        let joints = make_joints(&[Some("root")]);
        let mut diagnostics = Vec::new();
        let clip = parse_md5_anim(SINGLE_JOINT_STATIC, &joints, Some(&mut diagnostics)).unwrap();
        let clip = clip.read().unwrap();
        assert_eq!(clip.channels.len(), 2);
        assert!(Arc::ptr_eq(&target(&clip.channels[0]).node, &joints[0]));
        assert!(Arc::ptr_eq(&target(&clip.channels[1]).node, &joints[0]));
        assert_eq!(
            target(&clip.channels[0]).path,
            Scene3DAnimationPath::Translation
        );
        assert_eq!(
            target(&clip.channels[1]).path,
            Scene3DAnimationPath::Rotation
        );
        assert_eq!(sample(&clip.channels[0], 0.0), [5.0, 15.0, -10.0]);
        assert_eq!(sample(&clip.channels[1], 0.0), [0.0, 0.0, 0.0, -1.0]);
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "md5anim.bounds-unsupported");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Skip);
        assert_eq!(diagnostics[0].origin, "parseMd5Anim");
        assert!(diagnostics[0].detail.is_none());
    }

    #[test]
    fn animated_translation_interpolates_while_unanimated_joint_values_stay_parent_relative() {
        let joints = make_joints(&[Some("root"), Some("child")]);
        let mut diagnostics = Vec::new();
        let clip = parse_md5_anim(TWO_JOINT_TWO_FRAME, &joints, Some(&mut diagnostics)).unwrap();
        let clip = clip.read().unwrap();
        assert_eq!(clip.channels.len(), 4);
        assert_eq!(clip.duration, 1.0 / 30.0);
        assert_eq!(sample(&clip.channels[0], 0.0), [0.0, 0.0, 0.0]);
        assert_eq!(sample(&clip.channels[0], 1.0 / 30.0), [10.0, 30.0, -20.0]);
        assert_eq!(sample(&clip.channels[0], 0.5 / 30.0), [5.0, 15.0, -10.0]);
        for time in [0.0, 1.0 / 30.0] {
            assert_eq!(sample(&clip.channels[2], time), [1.0, 3.0, -2.0]);
        }
        assert!(
            diagnostics
                .iter()
                .all(|value| value.severity == ImportDiagnosticSeverity::Skip)
        );
        for (index, channel) in clip.channels.iter().enumerate() {
            let track = channel.track.read().unwrap();
            assert_eq!(track.times, [0.0, 1.0 / 30.0]);
            assert_eq!(track.interpolation, AnimationInterpolation::Linear);
            assert_eq!(track.quaternion, index % 2 == 1);
        }
    }

    #[test]
    fn binds_by_name_in_arbitrary_order_with_last_duplicate_and_positional_unnamed_fallbacks() {
        let joints = make_joints(&[Some("child"), Some("root")]);
        let clip = parse_md5_anim(TWO_JOINT_TWO_FRAME, &joints, None).unwrap();
        let clip = clip.read().unwrap();
        assert!(Arc::ptr_eq(&target(&clip.channels[0]).node, &joints[1]));
        assert!(Arc::ptr_eq(&target(&clip.channels[2]).node, &joints[0]));
        drop(clip);
        let joints = make_joints(&[None, Some(""), Some("root"), Some("root")]);
        let clip = parse_md5_anim(TWO_JOINT_TWO_FRAME, &joints, None).unwrap();
        let clip = clip.read().unwrap();
        assert!(Arc::ptr_eq(&target(&clip.channels[0]).node, &joints[3]));
        assert!(Arc::ptr_eq(&target(&clip.channels[2]).node, &joints[1]));
    }

    #[test]
    fn reconstructs_rotations_and_applies_all_six_component_bits_in_source_order() {
        let joints = make_joints(&[Some("root")]);
        let clip = parse_md5_anim(ANIMATED_ROTATION, &joints, None).unwrap();
        let clip = clip.read().unwrap();
        assert_eq!(sample(&clip.channels[1], 0.0), [0.0, 0.0, 0.0, -1.0]);
        assert_eq!(sample(&clip.channels[1], 0.1), [0.5, 0.5, -0.5, -0.5]);
        let source = "numFrames 1\nnumJoints 1\nnumAnimatedComponents 6\nhierarchy {\n\"root\" -1 63 0\n}\nbaseframe {\n( 0 0 0 ) ( 0 0 0 )\n}\nframe 0 {\n100 200 300 0.5 0.5 0.5\n}";
        let clip = parse_md5_anim(source, &joints, None).unwrap();
        let clip = clip.read().unwrap();
        assert_eq!(sample(&clip.channels[0], 0.0), [100.0, 300.0, -200.0]);
        assert_eq!(sample(&clip.channels[1], 0.0), [0.5, 0.5, -0.5, -0.5]);
    }

    #[test]
    fn rejects_empty_comment_only_missing_frames_and_insufficient_joints() {
        for source in [
            "",
            "// just a comment\n",
            "MD5Version 10\nnumFrames 0\nnumJoints 0",
            "hierarchy {\n\"j\" -1 0 0\n}",
        ] {
            let mut diagnostics = Vec::new();
            assert!(parse_md5_anim(source, &[], Some(&mut diagnostics)).is_none());
            assert_eq!(
                diagnostic(&diagnostics, "md5anim.no-data").severity,
                ImportDiagnosticSeverity::Reject
            );
        }
        let mut diagnostics = Vec::new();
        assert!(parse_md5_anim(SINGLE_JOINT_STATIC, &[], Some(&mut diagnostics)).is_none());
        let crumb = diagnostic(&diagnostics, "md5anim.joints-too-few");
        assert_eq!(crumb.severity, ImportDiagnosticSeverity::Reject);
        assert_eq!(number(crumb, "animationJoints"), 1.0);
        assert_eq!(number(crumb, "suppliedJoints"), 0.0);
    }

    #[test]
    fn header_recoveries_report_declared_counts_and_apply_the_source_frame_rate_default() {
        let joints = make_joints(&[None, None]);
        for (original, replacement, kind) in [
            (
                "MD5Version 10",
                "MD5Version 11",
                "md5anim.unsupported-version",
            ),
            (
                "numFrames 2",
                "numFrames xx",
                "md5anim.non-numeric-numframes",
            ),
            (
                "numJoints 2",
                "numJoints zz",
                "md5anim.non-numeric-numjoints",
            ),
            ("frameRate 30", "frameRate 0", "md5anim.invalid-framerate"),
            (
                "frameRate 30",
                "frameRate nope",
                "md5anim.invalid-framerate",
            ),
            ("numFrames 2", "numFrames 9", "md5anim.frame-count-mismatch"),
            ("numJoints 2", "numJoints 5", "md5anim.joint-count-mismatch"),
        ] {
            let source = TWO_JOINT_TWO_FRAME.replace(original, replacement);
            let mut diagnostics = Vec::new();
            let clip = parse_md5_anim(&source, &joints, Some(&mut diagnostics)).unwrap();
            let crumb = diagnostic(&diagnostics, kind);
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Recover);
            assert_eq!(crumb.origin, "parseMd5Anim");
            if kind == "md5anim.invalid-framerate" {
                assert_eq!(clip.read().unwrap().duration, 1.0 / 24.0);
            }
            if kind == "md5anim.unsupported-version" {
                assert_eq!(number(crumb, "version"), 11.0);
            }
            if kind.ends_with("count-mismatch") {
                assert_eq!(number(crumb, "found"), 2.0);
            }
        }
    }

    #[test]
    fn malformed_hierarchy_and_baseframe_records_keep_first_reason_and_drop_count() {
        let joints = make_joints(&[None]);
        for (source, kind, reason, line) in [
            (
                "hierarchy {\nbad one\nbad two\nbad three\n}",
                "hierarchy",
                "missing-name-quotes",
                2.0,
            ),
            (
                "hierarchy {\n\"root\" -1 0\n}",
                "hierarchy",
                "not-enough-components",
                2.0,
            ),
            (
                "hierarchy {\n\"root\" -1 nope 0\n}",
                "hierarchy",
                "non-numeric-values",
                2.0,
            ),
            (
                "baseframe {\n( abc def ) ( 0 0 0 )\n}",
                "baseframe",
                "not-enough-components",
                2.0,
            ),
            (
                "baseframe {\n( abc 0 0 ) ( 0 0 0 )\n}",
                "baseframe",
                "non-numeric-values",
                2.0,
            ),
        ] {
            let mut diagnostics = Vec::new();
            assert!(parse_md5_anim(source, &joints, Some(&mut diagnostics)).is_none());
            let crumb = diagnostic(&diagnostics, &format!("md5anim.malformed-{kind}"));
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
            assert_eq!(number(crumb, "firstLine"), line);
            assert_eq!(
                number(crumb, "count"),
                if source.contains("bad three") {
                    3.0
                } else {
                    1.0
                }
            );
            assert_eq!(
                crumb.detail.as_ref().unwrap().get("reason"),
                Some(&ImportDiagnosticDetailValue::String(reason.to_string()))
            );
            assert_eq!(diagnostics[0].kind, "md5anim.no-data");
        }
    }

    #[test]
    fn unclosed_block_tallies_flush_after_both_reject_outcomes_and_success() {
        let joints = make_joints(&[None]);
        for (source, kind) in [
            ("hierarchy {\n\"root\" -1 0 0", "hierarchy"),
            (
                "hierarchy {\n\"root\" -1 0 0\n}\nbaseframe {\n( 0 0 0 ) ( 0 0 0 )",
                "baseframe",
            ),
            (
                "numJoints 1\nnumFrames 1\nhierarchy {\n\"root\" -1 0 0\n}\nbaseframe {\n( 0 0 0 ) ( 0 0 0 )\n}\nframe 0 {",
                "frame",
            ),
        ] {
            let mut diagnostics = Vec::new();
            parse_md5_anim(source, &joints, Some(&mut diagnostics));
            let crumb = diagnostic(&diagnostics, &format!("md5anim.{kind}-block-unclosed"));
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Recover);
            assert_eq!(number(crumb, "count"), 1.0);
            parse_md5_anim(source, &joints, None);
        }
        let source = "numJoints 1\nnumFrames 1\nhierarchy {\n\"root\" -1 1 0\n}\nframe 0 {\nnope";
        let mut diagnostics = Vec::new();
        assert!(parse_md5_anim(source, &[], Some(&mut diagnostics)).is_none());
        let kinds: Vec<_> = diagnostics
            .iter()
            .map(|value| value.kind.as_str())
            .collect();
        assert_eq!(
            kinds,
            [
                "md5anim.joints-too-few",
                "md5anim.non-numeric-frame-value",
                "md5anim.frame-block-unclosed"
            ]
        );
    }

    #[test]
    fn invalid_frame_tokens_get_zero_placeholders_without_shifting_following_joint_components() {
        let source = "numFrames 1\nnumJoints 2\nframeRate 24\nnumAnimatedComponents 12\nhierarchy {\n\"root\" -1 63 0\n\"child\" 0 63 6\n}\nbaseframe {\n( 0 0 0 ) ( 0 0 0 )\n( 0 0 0 ) ( 0 0 0 )\n}\nframe 0 {\n1 2 nope 0 0 0\n70 80 90 0 0 0\n}";
        let joints = make_joints(&[Some("root"), Some("child")]);
        let mut diagnostics = Vec::new();
        let clip = parse_md5_anim(source, &joints, Some(&mut diagnostics)).unwrap();
        let clip = clip.read().unwrap();
        assert_eq!(sample(&clip.channels[0], 0.0), [1.0, 0.0, -2.0]);
        assert_eq!(sample(&clip.channels[2], 0.0), [70.0, 90.0, -80.0]);
        let crumb = diagnostic(&diagnostics, "md5anim.non-numeric-frame-value");
        assert_eq!(crumb.severity, ImportDiagnosticSeverity::Recover);
        assert_eq!(number(crumb, "count"), 1.0);
        assert_eq!(
            crumb.detail.as_ref().unwrap().get("firstToken"),
            Some(&ImportDiagnosticDetailValue::String("nope".to_string()))
        );
        assert_eq!(diagnostics.len(), 1);
    }

    #[test]
    fn independently_checks_component_totals_frame_width_baseframe_count_and_each_joint_window() {
        let source = "numJoints 2\nnumFrames 2\nnumAnimatedComponents 9\nhierarchy {\n\"root\" -1 7 -1\n\"child\" 0 7 8\n}\nbaseframe {\n( 5 10 15 ) ( 0 0 0 )\n}\nframe 0 {\n1 2\n}\nframe 1 {\n3\n}";
        let joints = make_joints(&[None, None]);
        let mut diagnostics = Vec::new();
        let clip = parse_md5_anim(source, &joints, Some(&mut diagnostics)).unwrap();
        let kinds: Vec<_> = diagnostics
            .iter()
            .map(|value| value.kind.as_str())
            .collect();
        assert_eq!(
            kinds,
            [
                "md5anim.component-count-mismatch",
                "md5anim.baseframe-count-mismatch",
                "md5anim.frame-width-mismatch",
                "md5anim.joint-frame-window-invalid"
            ]
        );
        assert_eq!(number(&diagnostics[0], "firstActual"), 6.0);
        assert_eq!(number(&diagnostics[0], "firstExpected"), 9.0);
        assert_eq!(number(&diagnostics[2], "firstFrame"), 0.0);
        assert_eq!(number(&diagnostics[2], "count"), 1.0);
        assert_eq!(number(&diagnostics[3], "firstJoint"), 0.0);
        assert_eq!(number(&diagnostics[3], "count"), 2.0);
        let clip = clip.read().unwrap();
        assert_eq!(sample(&clip.channels[0], 0.0), [5.0, 2.0, -1.0]);
        assert_eq!(sample(&clip.channels[2], 0.0), [0.0, 0.0, 0.0]);
    }

    #[test]
    fn comments_and_ecmascript_whitespace_do_not_add_diagnostics() {
        let source = SINGLE_JOINT_STATIC
            .replace("bounds {\n  ( -1 -1 -1 ) ( 1 1 1 )\n}", "")
            .replace("hierarchy {", "\u{feff}hierarchy {\n // comment")
            .replace("baseframe {", "baseframe {\n // another comment")
            .replace("frame 0 {", "frame 0 {\n // frame comment");
        let mut diagnostics = Vec::new();
        assert!(parse_md5_anim(&source, &make_joints(&[None]), Some(&mut diagnostics)).is_some());
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn animation_w_uses_source_precision_without_mesh_normalization_or_recovery() {
        let source = "numFrames 1\nnumJoints 1\nnumAnimatedComponents 3\nhierarchy {\n\"root\" -1 56 0\n}\nbaseframe {\n( 1e300 1.25junk 0xFF ) ( 0 0 0 )\n}\nframe 0 {\n0.999999999 0 0\n}";
        let joints = make_joints(&[None]);
        let mut diagnostics = Vec::new();
        let clip = parse_md5_anim(source, &joints, Some(&mut diagnostics)).unwrap();
        let clip = clip.read().unwrap();
        assert_eq!(sample(&clip.channels[0], 0.0), [f32::INFINITY, 0.0, -1.25]);
        let rotation = sample(&clip.channels[1], 0.0);
        assert_eq!(rotation[0], 1.0);
        assert!(rotation[3] < -0.00004 && rotation[3] > -0.00005);
        assert!(diagnostics.is_empty());
        drop(clip);
        for vector in ["2 0 0", "1e20 0 0"] {
            let source = source.replace("0.999999999 0 0", vector);
            let mut diagnostics = Vec::new();
            let clip = parse_md5_anim(&source, &joints, Some(&mut diagnostics)).unwrap();
            let rotation = sample(&clip.read().unwrap().channels[1], 0.0);
            assert_eq!(
                rotation[0],
                if vector.starts_with('2') { 2.0 } else { 1e20 }
            );
            assert_eq!(rotation[3], 0.0);
            assert!(diagnostics.is_empty());
        }
    }
}
