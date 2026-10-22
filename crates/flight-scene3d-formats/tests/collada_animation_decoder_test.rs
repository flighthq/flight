use flight_animation::AnimationInterpolation;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_scene3d::Scene3DAnimationPath;
use flight_scene3d_formats::*;

const DECODE_XML: &str = r##"<COLLADA><library_animations><animation><source id="t"><float_array>0 1</float_array></source><source id="o"><float_array>0 2</float_array></source><source id="i"><Name_array>LINEAR STEP</Name_array></source><sampler><input semantic="INPUT" source="#t"/><input semantic="OUTPUT" source="#o"/><input semantic="INTERPOLATION" source="#i"/></sampler><channel source="#s" target="node/rotate.ANGLE"/></animation></library_animations></COLLADA>"##;

const SOURCE_XML_0: &str = r##"<COLLADA><library_animations><animation><source id="t"><float_array>0 0.5 1</float_array></source><source id="o"><float_array>0 0 0  1 2 3  2 4 6</float_array></source><source id="i"><Name_array>LINEAR LINEAR LINEAR</Name_array></source><sampler id="s"><input semantic="INPUT" source="#t"/><input semantic="OUTPUT" source="#o"/><input semantic="INTERPOLATION" source="#i"/></sampler><channel source="#s" target="Bone/translate"/></animation></library_animations><library_visual_scenes><visual_scene id="vs"><node id="Bone" name="Bone"/></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_1: &str = r##"<COLLADA><library_animations><animation><source id="t"><float_array>0 1</float_array></source><source id="o"><float_array>0 90</float_array></source><source id="i"><Name_array>LINEAR LINEAR</Name_array></source><sampler id="s"><input semantic="INPUT" source="#t"/><input semantic="OUTPUT" source="#o"/><input semantic="INTERPOLATION" source="#i"/></sampler><channel source="#s" target="Joint/rotateY.ANGLE"/></animation></library_animations><library_visual_scenes><visual_scene id="vs"><node id="Joint" name="Joint"/></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_2: &str = r##"<COLLADA><library_animations><animation><source id="t"><float_array>0 1</float_array></source><source id="o"><float_array>1 0 0 0  0 1 0 0  0 0 1 0  0 0 0 1 1 0 0 5  0 1 0 0  0 0 1 0  0 0 0 1</float_array></source><source id="i"><Name_array>LINEAR LINEAR</Name_array></source><sampler id="s"><input semantic="INPUT" source="#t"/><input semantic="OUTPUT" source="#o"/><input semantic="INTERPOLATION" source="#i"/></sampler><channel source="#s" target="Box/matrix"/></animation></library_animations><library_visual_scenes><visual_scene id="vs"><node id="Box" name="Box"/></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_3: &str = r##"<COLLADA><library_animations><animation><source id="t"><float_array>0 1</float_array></source><source id="o"><float_array>0 0 0 1 1 1</float_array></source><source id="i"><Name_array>STEP STEP</Name_array></source><sampler id="s"><input semantic="INPUT" source="#t"/><input semantic="OUTPUT" source="#o"/><input semantic="INTERPOLATION" source="#i"/></sampler><channel source="#s" target="N/scale"/></animation></library_animations><library_visual_scenes><visual_scene id="vs"><node id="N" name="N"/></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_4: &str = r##"<COLLADA><library_animations><animation><source id="t"><float_array>0 1</float_array></source><source id="o"><float_array>0 1</float_array></source><source id="i"><Name_array>LINEAR LINEAR</Name_array></source><sampler id="s"><input semantic="INPUT" source="#t"/><input semantic="OUTPUT" source="#o"/><input semantic="INTERPOLATION" source="#i"/></sampler><channel source="#s" target="N/visibility"/></animation></library_animations><library_visual_scenes><visual_scene id="vs"><node id="N" name="N"/></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_5: &str = r##"<COLLADA><library_animations><animation><source id="t"><float_array>0 1</float_array></source><source id="o"><float_array>0 0 0 1 1 1</float_array></source><source id="i"><Name_array>LINEAR LINEAR</Name_array></source><sampler id="s"><input semantic="INPUT" source="#t"/><input semantic="OUTPUT" source="#o"/><input semantic="INTERPOLATION" source="#i"/></sampler><channel source="#s" target="Ghost/translate"/></animation></library_animations><library_visual_scenes><visual_scene id="vs"><node id="N" name="N"/></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

fn parse_animations(xml: &str) -> ColladaParseResult {
    return parse_collada(xml, None);
}

mod collada_animation_decoder {
    use super::*;

    #[test]
    fn resolves_translate_animation_channel_to_translation_track() {
        let decoder = COLLADA_ANIMATION_DECODER.read().unwrap();
        assert_eq!(decoder.build_phase, Some(40.0));
        assert!(decoder.build.is_some());
        assert_eq!(decoder.elements, ["animation"]);
        assert_eq!(decoder.features, ["Animation"]);
        drop(decoder);
        let result = parse_animations(SOURCE_XML_0);
        let document = result.document.read().unwrap();
        assert_eq!(document.animations.len(), 1);
        let animation = &document.animations[0];
        assert_eq!(animation.duration, 1.0);
        assert_eq!(animation.channels.len(), 1);
        let channel = &animation.channels[0];
        assert_eq!(channel.node, 0);
        assert_eq!(channel.path, Scene3DAnimationPath::Translation);
        let track = channel.track.read().unwrap();
        assert_eq!(track.interpolation, AnimationInterpolation::Linear);
        assert_eq!(track.components, 3);
        assert_eq!(track.times, [0.0, 0.5, 1.0]);
        assert_eq!(track.values, [0.0, 0.0, 0.0, 1.0, 2.0, 3.0, 2.0, 4.0, 6.0]);
    }

    #[test]
    fn resolves_rotate_y_angle_animation_to_quaternion_rotation_track() {
        let result = parse_animations(SOURCE_XML_1);
        let document = result.document.read().unwrap();
        assert_eq!(document.animations.len(), 1);
        let channel = &document.animations[0].channels[0];
        assert_eq!(channel.path, Scene3DAnimationPath::Rotation);
        let track = channel.track.read().unwrap();
        assert!(track.quaternion);
        assert_eq!(track.components, 4);
        let expected = [
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            (std::f64::consts::PI / 4.0).sin(),
            0.0,
            (std::f64::consts::PI / 4.0).cos(),
        ];
        for (index, expected) in expected.into_iter().enumerate() {
            // D1 f32 bound (TS: 0.000005)
            assert!((f64::from(track.values[index]) - expected).abs() < 0.000005);
        }
    }

    #[test]
    fn resolves_matrix_animation_to_decomposed_trs_channels() {
        let result = parse_animations(SOURCE_XML_2);
        let document = result.document.read().unwrap();
        assert_eq!(document.animations.len(), 1);
        let animation = &document.animations[0];
        assert_eq!(animation.channels.len(), 3);
        assert!(
            animation
                .channels
                .iter()
                .any(|channel| channel.path == Scene3DAnimationPath::Rotation)
        );
        assert!(
            animation
                .channels
                .iter()
                .any(|channel| channel.path == Scene3DAnimationPath::Scale)
        );
        let channel = animation
            .channels
            .iter()
            .find(|channel| channel.path == Scene3DAnimationPath::Translation)
            .unwrap();
        let track = channel.track.read().unwrap();
        assert_eq!(track.components, 3);
        for (index, expected) in [0.0, 0.0, 0.0, 5.0, 0.0, 0.0].into_iter().enumerate() {
            // D1 f32 bound (TS: 0.000005)
            assert!((track.values[index] - expected).abs() < 0.000005);
        }
    }

    #[test]
    fn maps_step_interpolation_to_step() {
        let result = parse_animations(SOURCE_XML_3);
        let document = result.document.read().unwrap();
        assert_eq!(
            document.animations[0].channels[0]
                .track
                .read()
                .unwrap()
                .interpolation,
            AnimationInterpolation::Step
        );
    }

    #[test]
    fn diagnoses_unsupported_animation_target_properties_and_unresolvable_nodes() {
        for (xml, kind) in [
            (SOURCE_XML_4, "collada.unsupported-animation-target"),
            (SOURCE_XML_5, "collada.animation-target-unresolved"),
        ] {
            let result = parse_animations(xml);
            assert!(result.document.read().unwrap().animations.is_empty());
            assert!(
                result
                    .diagnostics
                    .read()
                    .unwrap()
                    .iter()
                    .any(|entry| entry.kind == kind)
            );
        }
    }

    #[test]
    fn drops_short_matrix_cardinality_while_retaining_permissive_vector_tracks_and_source_last_time_duration()
     {
        let prefix = r##"<COLLADA><library_animations><animation><source id="t"><float_array>2 1</float_array></source><source id="o"><float_array>0 1</float_array></source><sampler><input semantic="INPUT" source="#t"/><input semantic="OUTPUT" source="#o"/></sampler><channel target="N/"##;
        let suffix = r##""/></animation></library_animations><library_visual_scenes><visual_scene id="vs"><node id="N"/></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;
        let result = parse_animations(&format!("{prefix}matrix{suffix}"));
        assert!(result.document.read().unwrap().animations.is_empty());
        let diagnostics = result.diagnostics.read().unwrap();
        let entry = diagnostics
            .iter()
            .find(|entry| entry.kind == "collada.animation-cardinality")
            .unwrap();
        assert_eq!(entry.severity, ImportDiagnosticSeverity::Drop);
        let detail = entry.detail.as_ref().unwrap();
        assert_eq!(
            detail.get("expected"),
            Some(&ImportDiagnosticDetailValue::Number(32.0))
        );
        assert_eq!(
            detail.get("actual"),
            Some(&ImportDiagnosticDetailValue::Number(2.0))
        );
        drop(diagnostics);
        let result = parse_animations(&format!("{prefix}translation{suffix}"));
        let document = result.document.read().unwrap();
        assert_eq!(document.animations[0].duration, 1.0);
        assert_eq!(
            document.animations[0].channels[0]
                .track
                .read()
                .unwrap()
                .values,
            [0.0, 1.0]
        );
    }
}

mod decode_collada_animations {
    use super::*;

    #[test]
    fn decodes_animation_channel_targets_and_interpolation_modes() {
        let channels = decode_collada_animations(DECODE_XML, None);
        assert_eq!(channels.len(), 1);
        let channel = channels[0].read().unwrap();
        assert_eq!(channel.target, "node/rotate.ANGLE");
        assert_eq!(channel.times, [0.0, 1.0]);
        assert_eq!(channel.values, [0.0, 2.0]);
        assert_eq!(channel.interpolation, ["LINEAR", "STEP"]);
        assert!(channel.in_tangents.is_empty());
        assert!(channel.out_tangents.is_empty());
    }

    #[test]
    fn returns_empty_unreadable_content_and_reports_decode_errors_in_original_order() {
        assert!(decode_collada_animations("", None).is_empty());
        let xml = r##"<COLLADA><animation/><animation><source id="i"><Name_array>UNKNOWN UNKNOWN</Name_array></source><sampler><input semantic="INTERPOLATION" source="#i"/></sampler><channel/></animation></COLLADA>"##;
        let mut diagnostics = Vec::new();
        assert!(decode_collada_animations(xml, Some(&mut diagnostics)).is_empty());
        assert_eq!(
            diagnostics
                .iter()
                .map(|entry| entry.kind.as_str())
                .collect::<Vec<_>>(),
            [
                "collada.missing-reference",
                "collada.unsupported-interpolation",
                "collada.unsupported-interpolation",
                "collada.missing-reference"
            ]
        );
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.origin == "decodeColladaAnimations")
        );
    }
}
