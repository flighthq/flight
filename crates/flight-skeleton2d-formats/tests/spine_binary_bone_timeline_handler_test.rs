use flight_skeleton2d_formats::contract::*;

use crate::support::with_empty_spine_binary_timeline;

mod build_spine_binary_segment_easings {
    use super::*;

    #[test]
    fn normalizes_dominant_component_controls_and_reports_differences() {
        let timeline = SpineBinaryValueTimeline {
            curves: vec![Some(vec![0.25, 2.5, 0.75, 7.5, 0.2, 20.0, 0.8, 80.0])],
            times: vec![0.0, 1.0],
            values: vec![0.0, 0.0, 10.0, 100.0],
        };
        let mut diagnostics = Vec::new();
        let actual =
            build_spine_binary_segment_easings(&timeline, 2, Some(&mut diagnostics)).unwrap();
        let expected = flight_easing::contract::ease_cubic_bezier(0.2, 0.2, 0.8, 0.8);
        let actual = actual[0].as_ref().unwrap();
        assert!((actual(0.3) - expected(0.3)).abs() < 1e-6);
        assert_eq!(
            diagnostics[0].kind,
            "spine.per-component-curve-easing-unsupported"
        );
    }

    #[test]
    fn preserves_the_absence_sentinel_for_a_single_key() {
        let timeline = SpineBinaryValueTimeline {
            curves: Vec::new(),
            times: vec![0.0],
            values: vec![1.0],
        };
        assert!(build_spine_binary_segment_easings(&timeline, 1, None).is_none());
    }
}

mod skip_spine_binary_bone_timelines {
    use super::*;
    #[test]
    fn consumes_an_empty_timeline() {
        with_empty_spine_binary_timeline(|c| skip_spine_binary_bone_timelines(c));
    }
}

mod spine_binary_bone_timeline_handler {
    use super::*;
    #[test]
    fn consumes_an_empty_timeline() {
        with_empty_spine_binary_timeline(|c| spine_binary_bone_timeline_handler(c));
    }
}
