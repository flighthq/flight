use flight_path::*;

mod for_each_path_segment_test {
    use super::*;

    #[test]
    fn visits_nothing_for_empty_path() {
        let path = create_path(PathWinding::NonZero);
        let segments = for_each_path_segment(&path);
        assert!(segments.is_empty());
    }

    #[test]
    fn yields_move_to_and_line_to_segments_in_order() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 1.0, 2.0);
        append_path_line_to(&mut path, 3.0, 4.0);
        let segments = for_each_path_segment(&path);
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0], PathSegment::MoveTo { x: 1.0, y: 2.0 });
        assert_eq!(segments[1], PathSegment::LineTo { x: 3.0, y: 4.0 });
    }

    #[test]
    fn yields_quadratic_curve_to_with_correct_coordinates() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_quadratic_curve_to(&mut path, 10.0, 20.0, 30.0, 0.0);
        let segments = for_each_path_segment(&path);
        assert_eq!(segments[1], PathSegment::QuadraticCurveTo {
            control_x: 10.0, control_y: 20.0, x: 30.0, y: 0.0,
        });
    }

    #[test]
    fn yields_cubic_curve_to_with_correct_coordinates() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_cubic_curve_to(&mut path, 10.0, 20.0, 30.0, 40.0, 50.0, 0.0);
        let segments = for_each_path_segment(&path);
        assert_eq!(segments[1], PathSegment::CubicCurveTo {
            control_x1: 10.0, control_y1: 20.0,
            control_x2: 30.0, control_y2: 40.0,
            x: 50.0, y: 0.0,
        });
    }

    #[test]
    fn yields_close_segment() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        append_path_close(&mut path);
        let segments = for_each_path_segment(&path);
        assert_eq!(segments[2], PathSegment::Close);
    }

    #[test]
    fn normalizes_wide_move_to() {
        let mut path = create_path(PathWinding::NonZero);
        path.commands.push(PathCommand::WideMoveTo as u8);
        path.data.extend_from_slice(&[0.0, 0.0, 5.0, 6.0]);
        let segments = for_each_path_segment(&path);
        assert_eq!(segments[0], PathSegment::MoveTo { x: 5.0, y: 6.0 });
    }

    #[test]
    fn normalizes_wide_line_to() {
        let mut path = create_path(PathWinding::NonZero);
        path.commands.push(PathCommand::WideMoveTo as u8);
        path.data.extend_from_slice(&[0.0, 0.0, 0.0, 0.0]);
        path.commands.push(PathCommand::WideLineTo as u8);
        path.data.extend_from_slice(&[0.0, 0.0, 7.0, 8.0]);
        let segments = for_each_path_segment(&path);
        assert_eq!(segments[1], PathSegment::LineTo { x: 7.0, y: 8.0 });
    }
}
