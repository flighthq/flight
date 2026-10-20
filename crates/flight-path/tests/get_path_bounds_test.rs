use flight_geometry::Rectangle;
use flight_path::*;

mod get_path_bounds_test {
    use super::*;

    #[test]
    fn returns_false_for_empty_path() {
        let path = create_path(PathWinding::NonZero);
        let mut r = Rectangle { x: 0.0, y: 0.0, width: 0.0, height: 0.0 };
        let result = get_path_bounds(&path, &mut r);
        assert!(!result);
        assert_eq!(r.x, 0.0);
        assert_eq!(r.width, 0.0);
    }

    #[test]
    fn computes_bounds_of_line_path() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 10.0, 20.0);
        append_path_line_to(&mut path, 100.0, 200.0);
        let mut r = Rectangle { x: 0.0, y: 0.0, width: 0.0, height: 0.0 };
        let result = get_path_bounds(&path, &mut r);
        assert!(result);
        assert!((r.x - 10.0).abs() < 0.01);
        assert!((r.y - 20.0).abs() < 0.01);
        assert!((r.width - 90.0).abs() < 0.01);
        assert!((r.height - 180.0).abs() < 0.01);
    }

    #[test]
    fn includes_cubic_bezier_extrema() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_cubic_curve_to(&mut path, 0.0, 100.0, 100.0, 100.0, 100.0, 0.0);
        let mut r = Rectangle { x: 0.0, y: 0.0, width: 0.0, height: 0.0 };
        get_path_bounds(&path, &mut r);
        assert!(r.height > 50.0);
    }

    #[test]
    fn includes_quadratic_bezier_extrema() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_quadratic_curve_to(&mut path, 50.0, 100.0, 100.0, 0.0);
        let mut r = Rectangle { x: 0.0, y: 0.0, width: 0.0, height: 0.0 };
        get_path_bounds(&path, &mut r);
        assert!(r.height > 40.0);
    }
}
