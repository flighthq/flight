use flight_path::*;

mod explain_stroke_path_tessellation_test {
    use super::*;

    #[test]
    fn reports_supported_for_valid_stroke() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let style = create_stroke_style();
        let explanation = explain_stroke_path_tessellation(&path, &style, 0.25);
        assert!(explanation.supported);
        assert_eq!(explanation.reason, StrokePathTessellationReason::Ok);
    }

    #[test]
    fn reports_invalid_style_for_zero_width() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut style = create_stroke_style();
        style.width = 0.0;
        let explanation = explain_stroke_path_tessellation(&path, &style, 0.25);
        assert!(!explanation.supported);
        assert_eq!(explanation.reason, StrokePathTessellationReason::InvalidStyle);
    }

    #[test]
    fn reports_invalid_style_for_negative_width() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut style = create_stroke_style();
        style.width = -5.0;
        let explanation = explain_stroke_path_tessellation(&path, &style, 0.25);
        assert!(!explanation.supported);
        assert_eq!(explanation.reason, StrokePathTessellationReason::InvalidStyle);
    }
}
