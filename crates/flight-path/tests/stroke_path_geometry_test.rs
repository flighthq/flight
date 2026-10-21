use flight_path::contract::*;

mod build_stroke_path_geometry {
    use super::*;

    #[test]
    fn returns_invalid_style_for_zero_width() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.width = 0.0;
        let geometry = build_stroke_path_geometry(&path, &style, 0.25);
        assert_eq!(geometry.issue, StrokePathTessellationReason::InvalidStyle);
    }

    #[test]
    fn returns_ok_for_valid_line() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        let geometry = build_stroke_path_geometry(&path, &style, 0.25);
        assert_eq!(geometry.issue, StrokePathTessellationReason::Ok);
        assert!(!geometry.pieces.is_empty());
    }

    #[test]
    fn builds_paired_closed_ring_sections_and_reports_pathological_centerlines() {
        let mut rectangle = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut rectangle, 0.0, 0.0, 100.0, 50.0);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.width = 10.0;
        let valid = build_stroke_path_geometry(&rectangle, &style, 0.25);
        assert_eq!(valid.issue, StrokePathTessellationReason::Ok);
        assert_eq!(valid.pieces.len(), 1);
        assert!(valid.pieces[0].closed);
        assert_eq!(valid.pieces[0].left.len(), valid.pieces[0].right.len());

        let mut crossing = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut crossing, 0.0, 0.0);
        append_path_line_to(&mut crossing, 40.0, 40.0);
        append_path_line_to(&mut crossing, 0.0, 40.0);
        append_path_line_to(&mut crossing, 40.0, 0.0);
        let mut crossing_style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        crossing_style.width = 10.0;
        let invalid = build_stroke_path_geometry(&crossing, &crossing_style, 0.25);
        assert_eq!(invalid.issue, StrokePathTessellationReason::SelfIntersectingCenterline);
        assert_eq!(invalid.issue_subpath, Some(0));
    }

    #[test]
    fn produces_left_and_right_sides() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        let geometry = build_stroke_path_geometry(&path, &style, 0.25);
        assert!(!geometry.pieces[0].left.is_empty());
        assert!(!geometry.pieces[0].right.is_empty());
    }
}
