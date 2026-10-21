use flight_geometry::create_rectangle;
use flight_path::*;

mod get_path_bounds_test {
    use super::*;

    #[test]
    fn returns_false_and_zero_rect_for_empty_path() {
        let path = create_path(Some(PathWinding::NonZero));
        let mut r = create_rectangle(1.0, 2.0, 3.0, 4.0);
        let result = get_path_bounds(&path, &mut r);
        assert!(!result);
        assert_eq!(r.x, 0.0);
        assert_eq!(r.y, 0.0);
        assert_eq!(r.width, 0.0);
        assert_eq!(r.height, 0.0);
    }

    #[test]
    fn returns_exact_bounds_of_rectangle() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut path, 10.0, 20.0, 100.0, 50.0);
        let mut r = create_rectangle(0.0, 0.0, 0.0, 0.0);
        let result = get_path_bounds(&path, &mut r);
        assert!(result);
        assert!((r.x - 10.0).abs() < 0.5);
        assert!((r.y - 20.0).abs() < 0.5);
        assert!((r.width - 100.0).abs() < 0.5);
        assert!((r.height - 50.0).abs() < 0.5);
    }

    #[test]
    fn includes_start_point_of_single_move_to() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 5.0, 7.0);
        let mut r = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_path_bounds(&path, &mut r);
        assert!((r.x - 5.0).abs() < 0.5);
        assert!((r.y - 7.0).abs() < 0.5);
        assert!(r.width.abs() < 0.5);
        assert!(r.height.abs() < 0.5);
    }

    #[test]
    fn expands_past_control_points_for_quadratic_curve() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_quadratic_curve_to(&mut path, 50.0, 100.0, 100.0, 0.0);
        let mut r = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_path_bounds(&path, &mut r);
        assert!(r.x.abs() < 0.5);
        assert!(r.y.abs() < 0.5);
        assert!((r.height - 50.0).abs() < 1.0);
        assert!((r.width - 100.0).abs() < 0.5);
    }

    #[test]
    fn expands_past_control_points_for_cubic_curve() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_cubic_curve_to(&mut path, 0.0, 100.0, 100.0, 100.0, 100.0, 0.0);
        let mut r = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_path_bounds(&path, &mut r);
        assert!(r.y.abs() < 0.5);
        assert!(r.height > 70.0);
        assert!(r.height < 100.0);
        assert!((r.width - 100.0).abs() < 0.5);
    }

    #[test]
    fn handles_move_and_line_spanning_multiple_quadrants() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, -50.0, -30.0);
        append_path_line_to(&mut path, 80.0, 60.0);
        let mut r = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_path_bounds(&path, &mut r);
        assert!((r.x - (-50.0)).abs() < 0.5);
        assert!((r.y - (-30.0)).abs() < 0.5);
        assert!((r.width - 130.0).abs() < 0.5);
        assert!((r.height - 90.0).abs() < 0.5);
    }
}
