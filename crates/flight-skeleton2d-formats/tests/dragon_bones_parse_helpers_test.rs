use flight_animation::contract::AnimationInterpolation;
use flight_skeleton2d_formats::contract::*;
use serde_json::{Value, json};

mod build_dragon_bones_segment_easings {
    use super::*;

    #[test]
    fn clamps_only_time_controls_and_preserves_value_overshoot() {
        let frames = dragon_bones_frames(
            Some(&json!([
                {"curve":[-1.0,-0.5,2.0,1.5]},
                {}
            ])),
            None,
        );
        let actual = build_dragon_bones_segment_easings(&frames).unwrap();
        let expected = flight_easing::contract::ease_cubic_bezier(0.0, -0.5, 1.0, 1.5);
        let actual = actual[0].as_ref().unwrap();
        for alpha in [0.2, 0.5, 0.8] {
            assert!((actual(alpha) - expected(alpha)).abs() < 1e-6);
        }
    }

    #[test]
    fn preserves_absence_for_an_uncurved_timeline() {
        assert!(build_dragon_bones_segment_easings(&[JsonRecord::new()]).is_none());
    }
}

mod dragon_bones_frame_times {
    use super::*;
    #[test]
    fn accumulates_frame_durations_on_the_fps_axis() {
        let frames = dragon_bones_frames(Some(&json!([{"duration":2},{"duration":3},{}])), None);
        let mut out = Vec::new();
        dragon_bones_frame_times(&mut out, &frames, 10.0);
        assert_eq!(out, [0.0, 0.2, 0.5]);
    }

    #[test]
    fn clears_and_reuses_storage_without_changing_duration_or_zero_rate_semantics() {
        let frames = dragon_bones_frames(
            Some(&json!([{"duration":2},{"duration":-3},{},{"duration":0}])),
            None,
        );
        let mut out = Vec::with_capacity(8);
        out.push(99.0);
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        dragon_bones_frame_times(&mut out, &frames, 2.0);
        assert_eq!(out, [0.0, 1.0, 1.0, 1.5]);
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);

        dragon_bones_frame_times(&mut out, &frames[..1], 4.0);
        assert_eq!(out, [0.0]);
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
        dragon_bones_frame_times(&mut out, &[], 4.0);
        assert!(out.is_empty());
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);

        dragon_bones_frame_times(&mut out, &frames[..2], 0.0);
        assert_eq!(out.len(), 2);
        assert!(out[0].is_nan());
        assert_eq!(out[1], f32::INFINITY);
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
    }
}

mod dragon_bones_frames {
    use super::*;
    #[test]
    fn retains_positions_for_malformed_frames() {
        let mut diagnostics = Vec::new();
        let frames = dragon_bones_frames(Some(&json!([{}, 5, {}])), Some(&mut diagnostics));
        assert_eq!(frames.len(), 3);
        assert_eq!(diagnostics[0].kind, "dragonbones.malformed-frame-recovered");
    }
}

mod dragon_bones_interpolation {
    use super::*;
    #[test]
    fn uses_step_only_when_every_open_segment_disables_tweening() {
        let stepped = dragon_bones_frames(Some(&json!([{"tweenEasing":100},{}])), None);
        assert_eq!(
            dragon_bones_interpolation(&stepped, None),
            AnimationInterpolation::Step
        );
        let linear = dragon_bones_frames(Some(&json!([{}, {}])), None);
        assert_eq!(
            dragon_bones_interpolation(&linear, None),
            AnimationInterpolation::Linear
        );
    }
}

mod number_or {
    use super::*;
    #[test]
    fn accepts_numbers_and_rejects_other_types() {
        assert_eq!(number_or(Some(&Value::from(3.5)), 7.0), 3.5);
        assert_eq!(number_or(Some(&Value::from("3.5")), 7.0), 7.0);
    }
}

mod parse_dragon_bones_bone_transform {
    use super::*;
    #[test]
    fn maps_legacy_and_modern_rotation_forms() {
        let legacy = parse_dragon_bones_bone_transform(Some(&json!({"skX":25,"skY":10})));
        assert_eq!(legacy.rotation, 10.0);
        assert_eq!(legacy.shear_y, 15.0);
        let modern = parse_dragon_bones_bone_transform(Some(&json!({"rotate":10,"skew":15})));
        assert_eq!(modern, legacy);
    }
}

mod skip_crumb_dragon_bones_group {
    use super::*;
    #[test]
    fn reports_only_nonempty_groups() {
        let mut diagnostics = Vec::new();
        skip_crumb_dragon_bones_group(Some(&mut diagnostics), Some(&json!([{}])), "test.kind");
        assert_eq!(diagnostics[0].kind, "test.kind");
    }
}
