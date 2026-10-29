use flight_path::contract::*;

mod explain_stroke_path_tessellation {
    use super::*;

    #[test]
    fn reports_a_supported_simple_closed_ring() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 50.0);
        let mut style = StrokeStyle {
            width: Some(1.0),
            cap: Some(StrokeCap::Butt),
            join: Some(StrokeJoin::Miter),
            miter_limit: Some(4.0),
            dash: Some(Vec::new()),
            dash_offset: Some(0.0),
        };
        style.width = Some(10.0);
        let explanation = explain_stroke_path_tessellation(&path, &style, Some(0.25));
        assert_eq!(explanation.reason, StrokePathTessellationReason::Ok);
        assert_eq!(explanation.subpath, None);
        assert!(explanation.supported);
    }

    #[test]
    fn reports_supported_for_valid_stroke() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let style = StrokeStyle {
            width: Some(1.0),
            cap: Some(StrokeCap::Butt),
            join: Some(StrokeJoin::Miter),
            miter_limit: Some(4.0),
            dash: Some(Vec::new()),
            dash_offset: Some(0.0),
        };
        let explanation = explain_stroke_path_tessellation(&path, &style, Some(0.25));
        assert!(explanation.supported);
        assert_eq!(explanation.reason, StrokePathTessellationReason::Ok);
    }

    #[test]
    fn reports_invalid_style_for_zero_width() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut style = StrokeStyle {
            width: Some(1.0),
            cap: Some(StrokeCap::Butt),
            join: Some(StrokeJoin::Miter),
            miter_limit: Some(4.0),
            dash: Some(Vec::new()),
            dash_offset: Some(0.0),
        };
        style.width = Some(0.0);
        let explanation = explain_stroke_path_tessellation(&path, &style, Some(0.25));
        assert!(!explanation.supported);
        assert_eq!(
            explanation.reason,
            StrokePathTessellationReason::InvalidStyle
        );
    }

    #[test]
    fn identifies_self_intersecting_subpath() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 40.0, 40.0);
        append_path_line_to(&mut path, 0.0, 40.0);
        append_path_line_to(&mut path, 40.0, 0.0);
        append_path_close(&mut path);
        let mut style = StrokeStyle {
            width: Some(1.0),
            cap: Some(StrokeCap::Butt),
            join: Some(StrokeJoin::Miter),
            miter_limit: Some(4.0),
            dash: Some(Vec::new()),
            dash_offset: Some(0.0),
        };
        style.width = Some(8.0);
        let explanation = explain_stroke_path_tessellation(&path, &style, Some(0.25));
        assert!(!explanation.supported);
        assert_eq!(
            explanation.reason,
            StrokePathTessellationReason::SelfIntersectingCenterline
        );
        assert_eq!(explanation.subpath, Some(0));
    }

    #[test]
    fn reports_invalid_style_for_negative_width() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut style = StrokeStyle {
            width: Some(1.0),
            cap: Some(StrokeCap::Butt),
            join: Some(StrokeJoin::Miter),
            miter_limit: Some(4.0),
            dash: Some(Vec::new()),
            dash_offset: Some(0.0),
        };
        style.width = Some(-5.0);
        let explanation = explain_stroke_path_tessellation(&path, &style, Some(0.25));
        assert!(!explanation.supported);
        assert_eq!(
            explanation.reason,
            StrokePathTessellationReason::InvalidStyle
        );
    }

    #[test]
    fn reports_invalid_style_input_without_throwing() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        let mut style = StrokeStyle {
            width: Some(1.0),
            cap: Some(StrokeCap::Butt),
            join: Some(StrokeJoin::Miter),
            miter_limit: Some(4.0),
            dash: Some(Vec::new()),
            dash_offset: Some(0.0),
        };
        style.width = Some(0.0);
        let explanation = explain_stroke_path_tessellation(&path, &style, Some(0.25));
        assert_eq!(
            explanation.reason,
            StrokePathTessellationReason::InvalidStyle
        );
        assert_eq!(explanation.subpath, None);
        assert!(!explanation.supported);
    }
}
