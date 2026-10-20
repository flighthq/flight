use flight_path::*;

mod fit_path_curves_test {
    use super::*;

    #[test]
    fn produces_cubics_from_polyline() {
        let mut source = create_path(PathWinding::NonZero);
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 20.0, 30.0);
        append_path_line_to(&mut source, 50.0, 40.0);
        append_path_line_to(&mut source, 80.0, 30.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        let mut out = create_path(PathWinding::NonZero);
        fit_path_curves(&source, 1.0, &mut out, 0.25);
        let has_cubic = out.commands.iter().any(|&c| c == PathCommand::CubicCurveTo as u8);
        assert!(has_cubic);
    }

    #[test]
    fn handles_two_point_contour() {
        let mut source = create_path(PathWinding::NonZero);
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        let mut out = create_path(PathWinding::NonZero);
        fit_path_curves(&source, 1.0, &mut out, 0.25);
        assert!(!out.commands.is_empty());
    }

    #[test]
    fn preserves_winding() {
        let mut source = create_path(PathWinding::EvenOdd);
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 50.0, 50.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        let mut out = create_path(PathWinding::NonZero);
        fit_path_curves(&source, 1.0, &mut out, 0.25);
        assert_eq!(out.winding, PathWinding::EvenOdd);
    }
}
