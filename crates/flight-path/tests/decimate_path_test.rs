use flight_path::*;

mod decimate_path_test {
    use super::*;

    #[test]
    fn reduces_collinear_points() {
        let mut source = create_path(PathWinding::NonZero);
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 10.0, 0.0);
        append_path_line_to(&mut source, 20.0, 0.0);
        append_path_line_to(&mut source, 30.0, 0.0);
        let mut out = create_path(PathWinding::NonZero);
        decimate_path(&source, 1.0, &mut out, 0.25);
        let contours = flatten_path(&out, 0.25);
        assert_eq!(contours.len(), 1);
        assert!(contours[0].len() / 2 <= 3);
    }

    #[test]
    fn preserves_distinct_corners() {
        let mut source = create_path(PathWinding::NonZero);
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        append_path_line_to(&mut source, 100.0, 100.0);
        let mut out = create_path(PathWinding::NonZero);
        decimate_path(&source, 1.0, &mut out, 0.25);
        let contours = flatten_path(&out, 0.25);
        assert_eq!(contours[0].len() / 2, 3);
    }
}
