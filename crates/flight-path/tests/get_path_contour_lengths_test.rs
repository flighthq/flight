use flight_path::*;

mod get_path_contour_lengths_test {
    use super::*;

    #[test]
    fn returns_empty_for_empty_path() {
        let path = create_path(PathWinding::NonZero);
        let lengths = get_path_contour_lengths(&path, 0.25);
        assert!(lengths.is_empty());
    }

    #[test]
    fn returns_one_length_per_contour() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 0.0, 50.0);
        let lengths = get_path_contour_lengths(&path, 0.25);
        assert_eq!(lengths.len(), 2);
        assert!((lengths[0] - 100.0).abs() < 0.5);
        assert!((lengths[1] - 50.0).abs() < 0.5);
    }
}
