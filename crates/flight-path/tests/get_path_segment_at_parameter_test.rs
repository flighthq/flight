use flight_geometry::create_vector2;
use flight_path::*;

mod get_cubic_bezier_curvature_test {
    use super::*;

    #[test]
    fn returns_zero_for_a_straight_cubic() {
        let c = get_cubic_bezier_curvature(0.0, 0.0, 1.0, 0.0, 2.0, 0.0, 3.0, 0.0, 0.5);
        assert_eq!(c, 0.0);
    }

    #[test]
    fn returns_nonzero_curvature_for_a_curved_cubic() {
        let c = get_cubic_bezier_curvature(0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.5);
        assert!(c != 0.0);
    }

    #[test]
    fn returns_a_known_curvature_for_a_circular_arc_approximation() {
        let k = get_cubic_bezier_curvature(1.0, 0.0, 1.0, 0.5523, 0.5523, 1.0, 0.0, 1.0, 0.5);
        assert!((k.abs() - 1.0).abs() < 0.1);
    }
}

mod get_cubic_bezier_point_test {
    use super::*;

    #[test]
    fn returns_the_start_point_at_t_zero() {
        let mut out = create_vector2(0.0, 0.0);
        get_cubic_bezier_point(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 0.0, &mut out);
        assert!((out.x - 1.0).abs() < 0.01);
        assert!((out.y - 2.0).abs() < 0.01);
    }

    #[test]
    fn returns_the_end_point_at_t_one() {
        let mut out = create_vector2(0.0, 0.0);
        get_cubic_bezier_point(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 1.0, &mut out);
        assert!((out.x - 7.0).abs() < 0.01);
        assert!((out.y - 8.0).abs() < 0.01);
    }

    #[test]
    fn interpolates_a_straight_cubic_at_midpoint() {
        let mut out = create_vector2(0.0, 0.0);
        get_cubic_bezier_point(0.0, 0.0, 1.0, 0.0, 2.0, 0.0, 3.0, 0.0, 0.5, &mut out);
        assert!((out.x - 1.5).abs() < 0.01);
        assert!((out.y - 0.0).abs() < 0.01);
    }
}

mod get_cubic_bezier_tangent_test {
    use super::*;

    #[test]
    fn returns_the_forward_tangent_at_t_zero() {
        let mut out = create_vector2(0.0, 0.0);
        get_cubic_bezier_tangent(0.0, 0.0, 3.0, 0.0, 6.0, 0.0, 9.0, 0.0, 0.0, &mut out);
        assert!((out.x - 9.0).abs() < 0.01);
        assert!((out.y - 0.0).abs() < 0.01);
    }

    #[test]
    fn returns_the_backward_tangent_at_t_one() {
        let mut out = create_vector2(0.0, 0.0);
        get_cubic_bezier_tangent(0.0, 0.0, 0.0, 0.0, 6.0, 0.0, 9.0, 0.0, 1.0, &mut out);
        assert!((out.x - 9.0).abs() < 0.01);
        assert!((out.y - 0.0).abs() < 0.01);
    }
}

mod get_path_segment_curvature_at_parameter_test {
    use super::*;

    #[test]
    fn returns_none_for_out_of_range_segment_index() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 1.0, 0.0);
        let result = get_path_segment_curvature_at_parameter(&path, 5, 0.5);
        assert!(result.is_none());
    }

    #[test]
    fn returns_zero_for_a_line_segment() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        let result = get_path_segment_curvature_at_parameter(&path, 0, 0.5);
        assert_eq!(result, Some(0.0));
    }

    #[test]
    fn returns_nonzero_for_a_quadratic_bezier_segment() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_quadratic_curve_to(&mut path, 50.0, 100.0, 100.0, 0.0);
        let result = get_path_segment_curvature_at_parameter(&path, 0, 0.5);
        assert!(result.is_some());
        assert!(result.unwrap() != 0.0);
    }

    #[test]
    fn returns_nonzero_for_a_cubic_bezier_segment() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_cubic_curve_to(&mut path, 0.0, 1.0, 1.0, 1.0, 1.0, 0.0);
        let result = get_path_segment_curvature_at_parameter(&path, 0, 0.5);
        assert!(result.is_some());
        assert!(result.unwrap() != 0.0);
    }
}

mod get_path_segment_point_at_parameter_test {
    use super::*;

    #[test]
    fn returns_false_for_out_of_range_segment_index() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 1.0, 0.0);
        let mut out = create_vector2(0.0, 0.0);
        let result = get_path_segment_point_at_parameter(&path, 5, 0.5, &mut out);
        assert!(!result);
    }

    #[test]
    fn evaluates_midpoint_of_a_line_segment() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        let mut out = create_vector2(0.0, 0.0);
        let result = get_path_segment_point_at_parameter(&path, 0, 0.5, &mut out);
        assert!(result);
        assert!((out.x - 5.0).abs() < 0.01);
        assert!((out.y - 0.0).abs() < 0.01);
    }

    #[test]
    fn evaluates_start_and_end_of_a_line_segment() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 2.0, 3.0);
        append_path_line_to(&mut path, 8.0, 9.0);
        let mut start = create_vector2(0.0, 0.0);
        let mut end = create_vector2(0.0, 0.0);
        get_path_segment_point_at_parameter(&path, 0, 0.0, &mut start);
        get_path_segment_point_at_parameter(&path, 0, 1.0, &mut end);
        assert!((start.x - 2.0).abs() < 0.01);
        assert!((start.y - 3.0).abs() < 0.01);
        assert!((end.x - 8.0).abs() < 0.01);
        assert!((end.y - 9.0).abs() < 0.01);
    }

    #[test]
    fn selects_the_correct_segment_by_index_in_a_multi_segment_path() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        append_path_line_to(&mut path, 10.0, 10.0);
        append_path_line_to(&mut path, 0.0, 10.0);
        let mut out = create_vector2(0.0, 0.0);
        get_path_segment_point_at_parameter(&path, 1, 0.5, &mut out);
        assert!((out.x - 10.0).abs() < 0.01);
        assert!((out.y - 5.0).abs() < 0.01);
    }

    #[test]
    fn evaluates_midpoint_of_a_quadratic_bezier() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_quadratic_curve_to(&mut path, 1.0, 2.0, 2.0, 0.0);
        let mut out = create_vector2(0.0, 0.0);
        let result = get_path_segment_point_at_parameter(&path, 0, 0.5, &mut out);
        assert!(result);
        assert!((out.x - 1.0).abs() < 0.01);
        assert!((out.y - 1.0).abs() < 0.01);
    }

    #[test]
    fn evaluates_midpoint_of_a_cubic_bezier() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_cubic_curve_to(&mut path, 0.0, 1.0, 1.0, 1.0, 1.0, 0.0);
        let mut out = create_vector2(0.0, 0.0);
        let result = get_path_segment_point_at_parameter(&path, 0, 0.5, &mut out);
        assert!(result);
        assert!((out.x - 0.5).abs() < 0.01);
        assert!((out.y - 0.75).abs() < 0.01);
    }
}

mod get_path_segment_tangent_at_parameter_test {
    use super::*;

    #[test]
    fn returns_false_for_out_of_range_segment_index() {
        let path = create_path(Some(PathWinding::NonZero));
        let mut out = create_vector2(0.0, 0.0);
        let result = get_path_segment_tangent_at_parameter(&path, 0, 0.5, &mut out);
        assert!(!result);
    }

    #[test]
    fn returns_the_tangent_direction_for_a_horizontal_line() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        let mut out = create_vector2(0.0, 0.0);
        let result = get_path_segment_tangent_at_parameter(&path, 0, 0.5, &mut out);
        assert!(result);
        assert!(out.x > 0.0);
        assert!(out.y.abs() < 0.01);
    }

    #[test]
    fn returns_a_non_zero_tangent_at_t_zero_for_a_cubic_bezier() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_cubic_curve_to(&mut path, 1.0, 3.0, 2.0, 3.0, 3.0, 0.0);
        let mut out = create_vector2(0.0, 0.0);
        let result = get_path_segment_tangent_at_parameter(&path, 0, 0.0, &mut out);
        assert!(result);
        assert!((out.x - 3.0).abs() < 0.01);
        assert!((out.y - 9.0).abs() < 0.01);
    }
}

mod get_quadratic_bezier_curvature_test {
    use super::*;

    #[test]
    fn returns_zero_for_a_straight_quadratic() {
        let c = get_quadratic_bezier_curvature(0.0, 0.0, 5.0, 0.0, 10.0, 0.0, 0.5);
        assert_eq!(c, 0.0);
    }

    #[test]
    fn returns_nonzero_for_a_curved_quadratic() {
        let k = get_quadratic_bezier_curvature(0.0, 0.0, 50.0, 100.0, 100.0, 0.0, 0.5);
        assert!(k != 0.0);
    }

    #[test]
    fn returns_consistent_sign_for_a_right_turning_curve() {
        let k = get_quadratic_bezier_curvature(0.0, 0.0, 0.0, 10.0, 10.0, 10.0, 0.5);
        assert!(k < 0.0);
    }
}

mod get_quadratic_bezier_point_test {
    use super::*;

    #[test]
    fn returns_midpoint_at_t_half_for_a_known_quadratic_curve() {
        let mut out = create_vector2(0.0, 0.0);
        get_quadratic_bezier_point(0.0, 0.0, 50.0, 100.0, 100.0, 0.0, 0.5, &mut out);
        assert!((out.x - 50.0).abs() < 0.01);
        assert!((out.y - 50.0).abs() < 0.01);
    }

    #[test]
    fn returns_start_at_t_zero() {
        let mut out = create_vector2(0.0, 0.0);
        get_quadratic_bezier_point(0.0, 1.0, 5.0, 5.0, 10.0, 1.0, 0.0, &mut out);
        assert!((out.x - 0.0).abs() < 0.01);
        assert!((out.y - 1.0).abs() < 0.01);
    }

    #[test]
    fn returns_end_at_t_one() {
        let mut out = create_vector2(0.0, 0.0);
        get_quadratic_bezier_point(0.0, 1.0, 5.0, 5.0, 10.0, 1.0, 1.0, &mut out);
        assert!((out.x - 10.0).abs() < 0.01);
        assert!((out.y - 1.0).abs() < 0.01);
    }
}

mod get_quadratic_bezier_tangent_test {
    use super::*;

    #[test]
    fn returns_the_end_tangent_direction_at_t_one() {
        let mut out = create_vector2(0.0, 0.0);
        get_quadratic_bezier_tangent(0.0, 0.0, 50.0, 100.0, 100.0, 0.0, 1.0, &mut out);
        assert!((out.x - 100.0).abs() < 0.01);
        assert!((out.y - (-200.0)).abs() < 0.01);
    }

    #[test]
    fn returns_the_midpoint_tangent_at_t_half() {
        let mut out = create_vector2(0.0, 0.0);
        get_quadratic_bezier_tangent(0.0, 0.0, 50.0, 100.0, 100.0, 0.0, 0.5, &mut out);
        assert!((out.x - 100.0).abs() < 0.01);
        assert!((out.y - 0.0).abs() < 0.01);
    }

    #[test]
    fn returns_the_start_tangent_direction_at_t_zero() {
        let mut out = create_vector2(0.0, 0.0);
        get_quadratic_bezier_tangent(0.0, 0.0, 4.0, 0.0, 8.0, 0.0, 0.0, &mut out);
        assert!((out.x - 8.0).abs() < 0.01);
        assert!((out.y - 0.0).abs() < 0.01);
    }
}
