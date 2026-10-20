use flight_geometry::Vector2;
use flight_path::*;

mod get_path_point_at_distance_test {
    use super::*;

    #[test]
    fn returns_false_for_empty_path() {
        let path = create_path(PathWinding::NonZero);
        let mut out = Vector2 { x: 0.0, y: 0.0 };
        let result = get_path_point_at_distance(&path, 0.0, &mut out, 0.25);
        assert!(!result);
    }

    #[test]
    fn returns_midpoint_of_line() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut out = Vector2 { x: 0.0, y: 0.0 };
        let result = get_path_point_at_distance(&path, 50.0, &mut out, 0.25);
        assert!(result);
        assert!((out.x - 50.0).abs() < 0.5);
        assert!(out.y.abs() < 0.5);
    }
}

mod get_path_position_at_distance_test {
    use super::*;

    #[test]
    fn returns_point_and_tangent() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut point = Vector2 { x: 0.0, y: 0.0 };
        let mut tangent = Vector2 { x: 0.0, y: 0.0 };
        let result = get_path_position_at_distance(&path, 50.0, &mut point, &mut tangent, 0.25);
        assert!(result);
        assert!((point.x - 50.0).abs() < 0.5);
        assert!((tangent.x - 1.0).abs() < 0.01);
        assert!(tangent.y.abs() < 0.01);
    }
}

mod get_path_tangent_at_distance_test {
    use super::*;

    #[test]
    fn returns_unit_tangent_along_horizontal_line() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut out = Vector2 { x: 0.0, y: 0.0 };
        let result = get_path_tangent_at_distance(&path, 50.0, &mut out, 0.25);
        assert!(result);
        assert!((out.x - 1.0).abs() < 0.01);
        assert!(out.y.abs() < 0.01);
    }
}
