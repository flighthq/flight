use flight_path::*;

mod get_path_curvature_at_distance_test {
    use super::*;

    #[test]
    fn returns_zero_for_empty_path() {
        let path = create_path(PathWinding::NonZero);
        let curvature = get_path_curvature_at_distance(&path, 0.0, 0.25);
        assert_eq!(curvature, 0.0);
    }

    #[test]
    fn returns_zero_for_straight_line() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 200.0, 0.0);
        let curvature = get_path_curvature_at_distance(&path, 50.0, 0.25);
        assert_eq!(curvature, 0.0);
    }

    #[test]
    fn returns_nonzero_for_curved_path() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 50.0, 0.0);
        append_path_line_to(&mut path, 100.0, 50.0);
        let curvature = get_path_curvature_at_distance(&path, 50.0, 0.25);
        assert!(curvature != 0.0);
    }
}
