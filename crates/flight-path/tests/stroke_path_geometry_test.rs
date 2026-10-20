use flight_path::*;

mod build_stroke_path_geometry_test {
    use super::*;

    #[test]
    fn returns_invalid_style_for_zero_width() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut style = create_stroke_style();
        style.width = 0.0;
        let geometry = build_stroke_path_geometry(&path, &style, 0.25);
        assert_eq!(geometry.issue, StrokePathTessellationReason::InvalidStyle);
    }

    #[test]
    fn returns_ok_for_valid_line() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let style = create_stroke_style();
        let geometry = build_stroke_path_geometry(&path, &style, 0.25);
        assert_eq!(geometry.issue, StrokePathTessellationReason::Ok);
        assert!(!geometry.pieces.is_empty());
    }

    #[test]
    fn produces_left_and_right_sides() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let style = create_stroke_style();
        let geometry = build_stroke_path_geometry(&path, &style, 0.25);
        assert!(!geometry.pieces[0].left.is_empty());
        assert!(!geometry.pieces[0].right.is_empty());
    }
}
