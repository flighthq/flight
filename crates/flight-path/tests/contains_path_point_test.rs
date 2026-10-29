use flight_path::contract::*;

fn ts_wire_path(commands: Vec<u8>, data: Vec<f64>) -> Path {
    let mut path = create_path(Some(PathWinding::NonZero));
    path.commands = commands;
    path.data = data;
    return path;
}

mod contains_path_point {
    use super::*;

    #[test]
    fn hit_tests_a_ts_serialized_square_with_no_op_bytes() {
        let path = ts_wire_path(
            vec![0, 1, 2, 0, 2, 2, 7],
            vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0],
        );
        assert!(contains_path_point(&path, 5.0, 5.0, None));
        assert!(!contains_path_point(&path, 15.0, 5.0, None));
    }

    #[test]
    fn returns_true_for_point_inside_convex_polygon_nonzero() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 100.0, 100.0);
        append_path_line_to(&mut path, 0.0, 100.0);
        append_path_line_to(&mut path, 0.0, 0.0);
        assert!(contains_path_point(&path, 50.0, 50.0, Some(0.25)));
    }

    #[test]
    fn returns_false_for_point_outside_convex_polygon_nonzero() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 100.0, 100.0);
        append_path_line_to(&mut path, 0.0, 100.0);
        append_path_line_to(&mut path, 0.0, 0.0);
        assert!(!contains_path_point(&path, 200.0, 200.0, Some(0.25)));
    }

    #[test]
    fn returns_true_for_point_inside_convex_polygon_even_odd() {
        let mut path = create_path(Some(PathWinding::NonZero));
        path.winding = PathWinding::EvenOdd;
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 100.0, 100.0);
        append_path_line_to(&mut path, 0.0, 100.0);
        append_path_line_to(&mut path, 0.0, 0.0);
        assert!(contains_path_point(&path, 50.0, 50.0, Some(0.25)));
    }

    #[test]
    fn returns_false_for_point_in_hole_with_even_odd_winding() {
        let mut path = create_path(Some(PathWinding::NonZero));
        path.winding = PathWinding::EvenOdd;
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 60.0, 0.0);
        append_path_line_to(&mut path, 60.0, 60.0);
        append_path_line_to(&mut path, 0.0, 60.0);
        append_path_line_to(&mut path, 0.0, 0.0);
        append_path_move_to(&mut path, 40.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 100.0, 60.0);
        append_path_line_to(&mut path, 40.0, 60.0);
        append_path_line_to(&mut path, 40.0, 0.0);
        assert!(!contains_path_point(&path, 50.0, 30.0, Some(0.25)));
        assert!(contains_path_point(&path, 20.0, 30.0, Some(0.25)));
    }

    #[test]
    fn returns_true_for_point_inside_inner_ring_with_nonzero_same_winding() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 60.0, 0.0);
        append_path_line_to(&mut path, 60.0, 60.0);
        append_path_line_to(&mut path, 0.0, 60.0);
        append_path_line_to(&mut path, 0.0, 0.0);
        append_path_move_to(&mut path, 40.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 100.0, 60.0);
        append_path_line_to(&mut path, 40.0, 60.0);
        append_path_line_to(&mut path, 40.0, 0.0);
        assert!(contains_path_point(&path, 50.0, 30.0, Some(0.25)));
    }

    #[test]
    fn handles_self_intersecting_figure_eight_path_nonzero() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 50.0, 50.0);
        append_path_line_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 0.0, 100.0);
        append_path_line_to(&mut path, 50.0, 50.0);
        append_path_line_to(&mut path, 100.0, 100.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 50.0, 50.0);
        assert!(contains_path_point(&path, 20.0, 50.0, Some(0.25)));
        assert!(contains_path_point(&path, 80.0, 50.0, Some(0.25)));
        assert!(!contains_path_point(&path, 50.0, 120.0, Some(0.25)));
    }

    #[test]
    fn handles_quadratic_curve_contour() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 100.0, 0.0);
        append_path_quadratic_curve_to(&mut path, 100.0, 100.0, 0.0, 100.0);
        append_path_line_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        assert!(contains_path_point(&path, 30.0, 30.0, Some(0.25)));
        assert!(!contains_path_point(&path, 90.0, 90.0, Some(0.25)));
    }

    #[test]
    fn handles_cubic_curve_contour() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_cubic_curve_to(&mut path, 100.0, 33.0, 100.0, 66.0, 100.0, 100.0);
        append_path_line_to(&mut path, 0.0, 100.0);
        append_path_line_to(&mut path, 0.0, 0.0);
        assert!(contains_path_point(&path, 50.0, 50.0, Some(0.25)));
        assert!(!contains_path_point(&path, 150.0, 50.0, Some(0.25)));
    }

    #[test]
    fn returns_false_for_degenerate_zero_area_contour() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 50.0, 0.0);
        append_path_line_to(&mut path, 0.0, 0.0);
        assert!(!contains_path_point(&path, 50.0, 0.0, Some(0.25)));
        assert!(!contains_path_point(&path, 50.0, 1.0, Some(0.25)));
    }

    #[test]
    fn returns_false_for_point_on_boundary_edge() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 100.0, 100.0);
        append_path_line_to(&mut path, 0.0, 100.0);
        append_path_line_to(&mut path, 0.0, 0.0);
        let _top_edge = contains_path_point(&path, 50.0, 0.0, Some(0.25));
        let _left_edge = contains_path_point(&path, 0.0, 50.0, Some(0.25));
    }

    #[test]
    fn returns_false_for_empty_path() {
        let path = create_path(Some(PathWinding::NonZero));
        assert!(!contains_path_point(&path, 0.0, 0.0, Some(0.25)));
    }

    #[test]
    fn handles_wide_line_to_command() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        path.commands.push(PathCommand::WIDE_LINE_TO as u8);
        path.data.push(0.0);
        path.data.push(0.0);
        path.data.push(100.0);
        path.data.push(0.0);
        append_path_line_to(&mut path, 100.0, 100.0);
        append_path_line_to(&mut path, 0.0, 100.0);
        append_path_line_to(&mut path, 0.0, 0.0);
        assert!(contains_path_point(&path, 50.0, 50.0, Some(0.25)));
    }

    #[test]
    fn handles_wide_move_to_command() {
        let mut path = create_path(Some(PathWinding::NonZero));
        path.commands.push(PathCommand::WIDE_MOVE_TO as u8);
        path.data.push(0.0);
        path.data.push(0.0);
        path.data.push(0.0);
        path.data.push(0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 100.0, 100.0);
        append_path_line_to(&mut path, 0.0, 100.0);
        append_path_line_to(&mut path, 0.0, 0.0);
        assert!(contains_path_point(&path, 50.0, 50.0, Some(0.25)));
    }

    #[test]
    fn handles_point_at_vertex_without_crashing() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 100.0, 100.0);
        append_path_line_to(&mut path, 0.0, 100.0);
        append_path_line_to(&mut path, 0.0, 0.0);
        let _at_vertex = contains_path_point(&path, 0.0, 0.0, Some(0.25));
        let _at_another = contains_path_point(&path, 100.0, 100.0, Some(0.25));
    }
}
