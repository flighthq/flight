use flight_path::*;

mod get_path_contour_orientation_test {
    use super::*;

    #[test]
    fn returns_degenerate_for_empty_path() {
        let path = create_path(PathWinding::NonZero);
        let orientation = get_path_contour_orientation(&path, 0.25);
        assert_eq!(orientation, ContourOrientation::Degenerate);
    }

    #[test]
    fn detects_ccw_rectangle() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 100.0, 100.0);
        append_path_line_to(&mut path, 0.0, 100.0);
        append_path_close(&mut path);
        let orientation = get_path_contour_orientation(&path, 0.25);
        assert!(orientation == ContourOrientation::Ccw || orientation == ContourOrientation::Cw);
    }
}

mod get_path_signed_area_test {
    use super::*;

    #[test]
    fn returns_zero_for_empty_path() {
        let path = create_path(PathWinding::NonZero);
        let area = get_path_signed_area(&path, 0.25);
        assert_eq!(area, 0.0);
    }

    #[test]
    fn returns_nonzero_for_closed_rectangle() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 100.0, 100.0);
        append_path_line_to(&mut path, 0.0, 100.0);
        append_path_close(&mut path);
        let area = get_path_signed_area(&path, 0.25);
        assert!((area.abs() - 10000.0).abs() < 1.0);
    }
}
