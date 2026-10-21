use flight_path::contract::*;

mod get_path_contour_orientation {
    use super::*;

    #[test]
    fn returns_degenerate_for_empty_path() {
        let path = create_path();
        let orientation = get_path_contour_orientation(&path, Some(0.25));
        assert_eq!(orientation, ContourOrientation::Degenerate);
    }

    #[test]
    fn returns_degenerate_for_straight_line() {
        let mut path = create_path();
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let orientation = get_path_contour_orientation(&path, Some(0.25));
        assert_eq!(orientation, ContourOrientation::Degenerate);
    }

    #[test]
    fn detects_orientation_for_rectangle() {
        let mut path = create_path();
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 100.0);
        let orientation = get_path_contour_orientation(&path, Some(0.25));
        assert!(orientation == ContourOrientation::Ccw || orientation == ContourOrientation::Cw);
    }
}

mod get_path_signed_area {
    use super::*;

    #[test]
    fn returns_zero_for_empty_path() {
        let path = create_path();
        let area = get_path_signed_area(&path, Some(0.25));
        assert_eq!(area, 0.0);
    }

    #[test]
    fn returns_correct_area_magnitude_for_rectangle() {
        let mut path = create_path();
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 100.0);
        let area = get_path_signed_area(&path, Some(0.25));
        assert!((area.abs() - 10000.0).abs() < 0.005);
    }

    #[test]
    fn returns_zero_for_straight_line() {
        let mut path = create_path();
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let area = get_path_signed_area(&path, Some(0.25));
        assert!((area).abs() < 0.001);
    }
}
