use flight_path::*;

mod get_path_length_test {
    use super::*;

    #[test]
    fn returns_zero_for_empty_path() {
        let path = create_path(PathWinding::NonZero);
        let length = get_path_length(&path, 0.25);
        assert_eq!(length, 0.0);
    }

    #[test]
    fn returns_length_of_straight_line() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let length = get_path_length(&path, 0.25);
        assert!((length - 100.0).abs() < 0.5);
    }

    #[test]
    fn sums_multiple_segments() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 100.0, 100.0);
        let length = get_path_length(&path, 0.25);
        assert!((length - 200.0).abs() < 0.5);
    }
}
