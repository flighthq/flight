use flight_geometry::Vector2;
use flight_path::*;

mod get_path_nearest_point_test {
    use super::*;

    #[test]
    fn returns_negative_for_empty_path() {
        let path = create_path(PathWinding::NonZero);
        let mut out = Vector2 { x: 0.0, y: 0.0 };
        let dist = get_path_nearest_point(&path, 50.0, 50.0, &mut out, 0.25);
        assert!(dist < 0.0);
    }

    #[test]
    fn finds_nearest_point_on_line_segment() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut out = Vector2 { x: 0.0, y: 0.0 };
        let dist = get_path_nearest_point(&path, 50.0, 10.0, &mut out, 0.25);
        assert!((dist - 10.0).abs() < 0.5);
        assert!((out.x - 50.0).abs() < 0.5);
        assert!(out.y.abs() < 0.5);
    }

    #[test]
    fn clamps_to_endpoints() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut out = Vector2 { x: 0.0, y: 0.0 };
        get_path_nearest_point(&path, -50.0, 0.0, &mut out, 0.25);
        assert!(out.x.abs() < 0.5);
    }
}
