use flight_path::*;

mod flatten_path_test {
    use super::*;

    #[test]
    fn returns_empty_for_empty_path() {
        let path = create_path(PathWinding::NonZero);
        let contours = flatten_path(&path, 0.25);
        assert!(contours.is_empty());
    }

    #[test]
    fn flattens_line_segments_unchanged() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 100.0, 100.0);
        let contours = flatten_path(&path, 0.25);
        assert_eq!(contours.len(), 1);
        assert_eq!(contours[0], vec![0.0, 0.0, 100.0, 0.0, 100.0, 100.0]);
    }

    #[test]
    fn close_appends_start_point() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 50.0, 100.0);
        append_path_close(&mut path);
        let contours = flatten_path(&path, 0.25);
        assert_eq!(contours.len(), 1);
        let c = &contours[0];
        assert_eq!(c[c.len() - 2], 0.0);
        assert_eq!(c[c.len() - 1], 0.0);
    }

    #[test]
    fn subdivides_quadratic_curves() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_quadratic_curve_to(&mut path, 50.0, 100.0, 100.0, 0.0);
        let contours = flatten_path(&path, 0.25);
        assert_eq!(contours.len(), 1);
        assert!(contours[0].len() > 4);
    }

    #[test]
    fn subdivides_cubic_curves() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_cubic_curve_to(&mut path, 33.0, 100.0, 66.0, 100.0, 100.0, 0.0);
        let contours = flatten_path(&path, 0.25);
        assert_eq!(contours.len(), 1);
        assert!(contours[0].len() > 4);
    }

    #[test]
    fn produces_multiple_contours_for_multiple_moves() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 10.0);
        append_path_move_to(&mut path, 20.0, 20.0);
        append_path_line_to(&mut path, 30.0, 30.0);
        let contours = flatten_path(&path, 0.25);
        assert_eq!(contours.len(), 2);
    }
}
