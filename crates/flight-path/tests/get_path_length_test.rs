use flight_path::contract::*;

mod get_path_length {
    use super::*;

    #[test]
    fn returns_zero_for_empty_path() {
        let path = create_path();
        let length = get_path_length(&path, Some(0.25));
        assert_eq!(length, 0.0);
    }

    #[test]
    fn returns_correct_length_of_diagonal_line() {
        let mut path = create_path();
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 30.0, 40.0);
        let length = get_path_length(&path, Some(0.25));
        assert!((length - 50.0).abs() < 0.005);
    }

    #[test]
    fn returns_perimeter_of_rectangle() {
        let mut path = create_path();
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 50.0);
        let length = get_path_length(&path, Some(0.25));
        assert!((length - 300.0).abs() < 0.005);
    }

    #[test]
    fn sums_lengths_across_multiple_subpaths() {
        let mut path = create_path();
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 0.0, 5.0);
        let length = get_path_length(&path, Some(0.25));
        assert!((length - 15.0).abs() < 0.005);
    }
}
