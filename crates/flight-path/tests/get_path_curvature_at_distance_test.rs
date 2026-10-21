use flight_path::contract::*;

mod get_path_curvature_at_distance {
    use super::*;

    #[test]
    fn returns_zero_for_empty_path() {
        let path = create_path();
        let curvature = get_path_curvature_at_distance(&path, 0.0, Some(0.25));
        assert_eq!(curvature, 0.0);
    }

    #[test]
    fn returns_zero_for_straight_line() {
        let mut path = create_path();
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let curvature = get_path_curvature_at_distance(&path, 50.0, Some(0.25));
        assert_eq!(curvature, 0.0);
    }

    #[test]
    fn returns_nonzero_curvature_on_curved_path() {
        let mut path = create_path();
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_quadratic_curve_to(&mut path, 50.0, 100.0, 100.0, 0.0);
        let k = get_path_curvature_at_distance(&path, 50.0, Some(0.01));
        assert!(k != 0.0);
    }

    #[test]
    fn returns_approximately_inverse_radius_for_circle() {
        let r = 50.0;
        let mut path = create_path();
        append_path_circle(&mut path, 0.0, 0.0, r);
        let circumference = 2.0 * std::f64::consts::PI * r;
        let k = get_path_curvature_at_distance(&path, circumference / 4.0, Some(0.01));
        assert!((k.abs() - 1.0 / r).abs() < 0.1);
    }

    #[test]
    fn clamps_at_end_for_distances_beyond_length() {
        let mut path = create_path();
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_quadratic_curve_to(&mut path, 50.0, 100.0, 100.0, 0.0);
        let tolerance = 0.01;
        let length = get_path_length(&path, Some(tolerance));
        let k_end = get_path_curvature_at_distance(&path, length, Some(tolerance));
        let k_beyond = get_path_curvature_at_distance(&path, length + 100.0, Some(tolerance));
        assert!(k_end != 0.0);
        assert!((k_end - k_beyond).abs() < 5e-13);
    }
}
