use flight_path::contract::*;

mod explain_stroke_path_tessellation_test {
    use super::*;

    #[test]
    fn reports_supported_for_valid_stroke() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let style = create_stroke_style();
        let explanation = explain_stroke_path_tessellation(&path, &style, 0.25);
        assert!(explanation.supported);
        assert_eq!(explanation.reason, StrokePathTessellationReason::Ok);
    }

    #[test]
    fn reports_invalid_style_for_zero_width() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut style = create_stroke_style();
        style.width = 0.0;
        let explanation = explain_stroke_path_tessellation(&path, &style, 0.25);
        assert!(!explanation.supported);
        assert_eq!(explanation.reason, StrokePathTessellationReason::InvalidStyle);
    }

    #[test]
    fn identifies_self_intersecting_subpath() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 40.0, 40.0);
        append_path_line_to(&mut path, 0.0, 40.0);
        append_path_line_to(&mut path, 40.0, 0.0);
        append_path_close(&mut path);
        let mut style = create_stroke_style();
        style.width = 8.0;
        let explanation = explain_stroke_path_tessellation(&path, &style, 0.25);
        assert!(!explanation.supported);
        assert_eq!(explanation.reason, StrokePathTessellationReason::SelfIntersectingCenterline);
        assert_eq!(explanation.subpath, Some(0));
    }

    #[test]
    fn reports_invalid_style_for_negative_width() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut style = create_stroke_style();
        style.width = -5.0;
        let explanation = explain_stroke_path_tessellation(&path, &style, 0.25);
        assert!(!explanation.supported);
        assert_eq!(explanation.reason, StrokePathTessellationReason::InvalidStyle);
    }
}
