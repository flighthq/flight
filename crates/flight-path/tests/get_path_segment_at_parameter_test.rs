use flight_geometry::Vector2;
use flight_path::*;

mod get_cubic_bezier_curvature_test {
    use super::*;

    #[test]
    fn returns_zero_for_degenerate_curve() {
        let c = get_cubic_bezier_curvature(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5);
        assert_eq!(c, 0.0);
    }

    #[test]
    fn returns_nonzero_for_curved_segment() {
        let c = get_cubic_bezier_curvature(0.0, 0.0, 0.0, 100.0, 100.0, 100.0, 100.0, 0.0, 0.5);
        assert!(c != 0.0);
    }
}

mod get_cubic_bezier_point_test {
    use super::*;

    #[test]
    fn returns_start_at_t_zero() {
        let mut out = Vector2 { x: 0.0, y: 0.0 };
        get_cubic_bezier_point(10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 0.0, &mut out);
        assert!((out.x - 10.0).abs() < 0.01);
        assert!((out.y - 20.0).abs() < 0.01);
    }

    #[test]
    fn returns_end_at_t_one() {
        let mut out = Vector2 { x: 0.0, y: 0.0 };
        get_cubic_bezier_point(10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 1.0, &mut out);
        assert!((out.x - 70.0).abs() < 0.01);
        assert!((out.y - 80.0).abs() < 0.01);
    }
}

mod get_cubic_bezier_tangent_test {
    use super::*;

    #[test]
    fn returns_nonzero_tangent() {
        let mut out = Vector2 { x: 0.0, y: 0.0 };
        get_cubic_bezier_tangent(0.0, 0.0, 100.0, 0.0, 100.0, 100.0, 0.0, 100.0, 0.0, &mut out);
        assert!(out.x.abs() > 0.01 || out.y.abs() > 0.01);
    }
}

mod get_path_segment_curvature_at_parameter_test {
    use super::*;

    #[test]
    fn returns_none_for_out_of_range_index() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let result = get_path_segment_curvature_at_parameter(&path, 10, 0.5);
        assert!(result.is_none());
    }

    #[test]
    fn returns_zero_for_line_segment() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let result = get_path_segment_curvature_at_parameter(&path, 0, 0.5);
        assert_eq!(result, Some(0.0));
    }
}

mod get_path_segment_point_at_parameter_test {
    use super::*;

    #[test]
    fn returns_false_for_out_of_range_index() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        let mut out = Vector2 { x: 0.0, y: 0.0 };
        let result = get_path_segment_point_at_parameter(&path, 10, 0.5, &mut out);
        assert!(!result);
    }

    #[test]
    fn interpolates_line_segment() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut out = Vector2 { x: 0.0, y: 0.0 };
        let result = get_path_segment_point_at_parameter(&path, 0, 0.5, &mut out);
        assert!(result);
        assert!((out.x - 50.0).abs() < 0.01);
    }
}

mod get_path_segment_tangent_at_parameter_test {
    use super::*;

    #[test]
    fn returns_direction_for_line_segment() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut out = Vector2 { x: 0.0, y: 0.0 };
        let result = get_path_segment_tangent_at_parameter(&path, 0, 0.5, &mut out);
        assert!(result);
        assert!((out.x - 100.0).abs() < 0.01);
        assert!(out.y.abs() < 0.01);
    }
}

mod get_quadratic_bezier_curvature_test {
    use super::*;

    #[test]
    fn returns_zero_for_degenerate() {
        let c = get_quadratic_bezier_curvature(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5);
        assert_eq!(c, 0.0);
    }
}

mod get_quadratic_bezier_point_test {
    use super::*;

    #[test]
    fn returns_start_at_t_zero() {
        let mut out = Vector2 { x: 0.0, y: 0.0 };
        get_quadratic_bezier_point(10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 0.0, &mut out);
        assert!((out.x - 10.0).abs() < 0.01);
        assert!((out.y - 20.0).abs() < 0.01);
    }

    #[test]
    fn returns_end_at_t_one() {
        let mut out = Vector2 { x: 0.0, y: 0.0 };
        get_quadratic_bezier_point(10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 1.0, &mut out);
        assert!((out.x - 50.0).abs() < 0.01);
        assert!((out.y - 60.0).abs() < 0.01);
    }
}

mod get_quadratic_bezier_tangent_test {
    use super::*;

    #[test]
    fn returns_nonzero_tangent() {
        let mut out = Vector2 { x: 0.0, y: 0.0 };
        get_quadratic_bezier_tangent(0.0, 0.0, 50.0, 100.0, 100.0, 0.0, 0.5, &mut out);
        assert!(out.x.abs() > 0.01 || out.y.abs() > 0.01);
    }
}
