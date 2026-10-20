use flight_path::*;

mod contains_path_point_test {
    use super::*;

    #[test]
    fn returns_true_for_point_inside_rectangle() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 100.0);
        assert!(contains_path_point(&path, 50.0, 50.0, 0.25));
    }

    #[test]
    fn returns_false_for_point_outside_rectangle() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 100.0);
        assert!(!contains_path_point(&path, 150.0, 50.0, 0.25));
    }

    #[test]
    fn returns_false_for_empty_path() {
        let path = create_path(PathWinding::NonZero);
        assert!(!contains_path_point(&path, 0.0, 0.0, 0.25));
    }

    #[test]
    fn handles_even_odd_winding() {
        let mut path = create_path(PathWinding::EvenOdd);
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 100.0);
        assert!(contains_path_point(&path, 50.0, 50.0, 0.25));
    }
}
