use flight_geometry::create_vector2;
use flight_path::contract::*;

mod get_path_nearest_point {
    use super::*;

    #[test]
    fn returns_negative_for_empty_path() {
        let path = create_path(Some(PathWinding::NonZero));
        let mut out = create_vector2(0.0, 0.0);
        let dist = get_path_nearest_point(&path, 5.0, 5.0, &mut out, 0.25);
        assert!(dist < 0.0);
    }

    #[test]
    fn returns_zero_for_point_on_path() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut out = create_vector2(0.0, 0.0);
        let dist = get_path_nearest_point(&path, 50.0, 0.0, &mut out, 0.25);
        assert!((dist).abs() < 0.5);
        assert!((out.x - 50.0).abs() < 0.5);
        assert!(out.y.abs() < 0.5);
    }

    #[test]
    fn returns_perpendicular_distance_for_point_off_path() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut out = create_vector2(0.0, 0.0);
        let dist = get_path_nearest_point(&path, 50.0, 30.0, &mut out, 0.25);
        assert!((dist - 30.0).abs() < 0.5);
        assert!((out.x - 50.0).abs() < 0.5);
        assert!(out.y.abs() < 0.5);
    }

    #[test]
    fn picks_closest_contour_in_multi_contour_path() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_move_to(&mut path, 0.0, 10.0);
        append_path_line_to(&mut path, 100.0, 10.0);
        let mut out = create_vector2(0.0, 0.0);
        let dist = get_path_nearest_point(&path, 50.0, 8.0, &mut out, 0.25);
        assert!((dist - 2.0).abs() < 0.5);
        assert!((out.y - 10.0).abs() < 0.5);
    }

    #[test]
    fn clamps_to_endpoint_when_projection_falls_outside() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 10.0, 0.0);
        append_path_line_to(&mut path, 90.0, 0.0);
        let mut out = create_vector2(0.0, 0.0);
        let dist = get_path_nearest_point(&path, 0.0, 0.0, &mut out, 0.25);
        assert!((dist - 10.0).abs() < 0.5);
        assert!((out.x - 10.0).abs() < 0.5);
        assert!(out.y.abs() < 0.5);
    }

    #[test]
    fn works_with_curved_paths() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_circle(&mut path, 0.0, 0.0, 50.0);
        let mut out = create_vector2(0.0, 0.0);
        let dist = get_path_nearest_point(&path, 100.0, 0.0, &mut out, 0.25);
        assert!((dist - 50.0).abs() < 1.0);
        assert!((out.x - 50.0).abs() < 1.0);
        assert!(out.y.abs() < 1.0);
    }
}
