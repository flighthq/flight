use flight_geometry::create_vector2;
use flight_path::contract::*;

mod get_path_point_at_distance {
    use super::*;

    #[test]
    fn returns_false_for_empty_path() {
        let path = create_path();
        let mut out = create_vector2(0.0, 0.0);
        let result = get_path_point_at_distance(&path, 0.0, &mut out, Some(0.25));
        assert!(!result);
    }

    #[test]
    fn returns_start_point_at_distance_zero() {
        let mut path = create_path();
        append_path_move_to(&mut path, 5.0, 10.0);
        append_path_line_to(&mut path, 15.0, 10.0);
        let mut out = create_vector2(0.0, 0.0);
        get_path_point_at_distance(&path, 0.0, &mut out, Some(0.25));
        assert!((out.x - 5.0).abs() < 0.005);
        assert!((out.y - 10.0).abs() < 0.005);
    }

    #[test]
    fn interpolates_to_midpoint_of_segment() {
        let mut path = create_path();
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut out = create_vector2(0.0, 0.0);
        get_path_point_at_distance(&path, 50.0, &mut out, Some(0.25));
        assert!((out.x - 50.0).abs() < 0.005);
        assert!(out.y.abs() < 0.005);
    }

    #[test]
    fn clamps_to_end_when_distance_exceeds_length() {
        let mut path = create_path();
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        let mut out = create_vector2(0.0, 0.0);
        get_path_point_at_distance(&path, 1000.0, &mut out, Some(0.25));
        assert!((out.x - 10.0).abs() < 0.005);
        assert!(out.y.abs() < 0.005);
    }

    #[test]
    fn clamps_to_start_when_distance_is_negative() {
        let mut path = create_path();
        append_path_move_to(&mut path, 5.0, 5.0);
        append_path_line_to(&mut path, 15.0, 5.0);
        let mut out = create_vector2(0.0, 0.0);
        get_path_point_at_distance(&path, -10.0, &mut out, Some(0.25));
        assert!((out.x - 5.0).abs() < 0.005);
        assert!((out.y - 5.0).abs() < 0.005);
    }
}

mod get_path_position_at_distance {
    use super::*;

    #[test]
    fn returns_both_point_and_tangent_simultaneously() {
        let mut path = create_path();
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut point = create_vector2(0.0, 0.0);
        let mut tangent = create_vector2(0.0, 0.0);
        let result =
            get_path_position_at_distance(&path, 50.0, &mut point, &mut tangent, Some(0.25));
        assert!(result);
        assert!((point.x - 50.0).abs() < 0.005);
        assert!(point.y.abs() < 0.005);
        assert!((tangent.x - 1.0).abs() < 0.005);
        assert!(tangent.y.abs() < 0.005);
    }
}

mod get_path_tangent_at_distance {
    use super::*;

    #[test]
    fn returns_default_tangent_for_empty_path() {
        let path = create_path();
        let mut out = create_vector2(0.0, 0.0);
        get_path_tangent_at_distance(&path, 0.0, &mut out, Some(0.25));
        assert!((out.x - 1.0).abs() < 0.005);
        assert!(out.y.abs() < 0.005);
    }

    #[test]
    fn returns_unit_tangent_along_horizontal_line() {
        let mut path = create_path();
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut out = create_vector2(0.0, 0.0);
        let result = get_path_tangent_at_distance(&path, 50.0, &mut out, Some(0.25));
        assert!(result);
        assert!((out.x - 1.0).abs() < 0.005);
        assert!(out.y.abs() < 0.005);
    }

    #[test]
    fn returns_unit_tangent_along_vertical_line() {
        let mut path = create_path();
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 0.0, 100.0);
        let mut out = create_vector2(0.0, 0.0);
        let result = get_path_tangent_at_distance(&path, 50.0, &mut out, Some(0.25));
        assert!(result);
        assert!(out.x.abs() < 0.005);
        assert!((out.y - 1.0).abs() < 0.005);
    }
}
