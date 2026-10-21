use flight_path::contract::*;

mod get_path_contour_lengths {
    use super::*;

    #[test]
    fn returns_empty_for_empty_path() {
        let path = create_path();
        let lengths = get_path_contour_lengths(&path, Some(0.25));
        assert!(lengths.is_empty());
    }

    #[test]
    fn returns_single_length_matching_total_for_single_contour() {
        let mut path = create_path();
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 100.0, 50.0);
        let lengths = get_path_contour_lengths(&path, Some(0.25));
        assert_eq!(lengths.len(), 1);
        let total = get_path_length(&path, Some(0.25));
        assert!((lengths[0] - total).abs() < 0.005);
    }

    #[test]
    fn returns_per_contour_lengths_for_multi_contour_path() {
        let mut path = create_path();
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 30.0, 0.0);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 0.0, 40.0);
        let lengths = get_path_contour_lengths(&path, Some(0.25));
        assert_eq!(lengths.len(), 2);
        assert!((lengths[0] - 30.0).abs() < 0.005);
        assert!((lengths[1] - 40.0).abs() < 0.005);
    }

    #[test]
    fn accounts_for_closed_contours() {
        let mut path = create_path();
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 50.0);
        let lengths = get_path_contour_lengths(&path, Some(0.25));
        assert_eq!(lengths.len(), 1);
        assert!((lengths[0] - 300.0).abs() < 0.005);
    }

    #[test]
    fn sums_per_contour_lengths_to_match_total() {
        let mut path = create_path();
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 0.0, 20.0);
        append_path_close(&mut path);
        let lengths = get_path_contour_lengths(&path, Some(0.25));
        let sum: f64 = lengths.iter().sum();
        let total = get_path_length(&path, Some(0.25));
        assert!((sum - total).abs() < 0.005);
    }
}
