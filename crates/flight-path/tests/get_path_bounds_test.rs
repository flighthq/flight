use flight_geometry::create_rectangle;
use flight_path::contract::*;

fn ts_wire_path(commands: Vec<u8>, data: Vec<f64>) -> Path {
    let mut path = create_path(Some(PathWinding::NonZero));
    path.commands = commands;
    path.data = data;
    return path;
}

mod get_path_bounds {
    use super::*;

    #[test]
    fn bounds_a_ts_serialized_stream_with_no_op_bytes() {
        let path = ts_wire_path(vec![0, 1, 0, 2, 7], vec![1.0, 2.0, 11.0, 22.0]);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        assert!(get_path_bounds(&path, &mut out));
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (1.0, 2.0, 10.0, 20.0)
        );
    }

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
        assert!((r.x - 10.0).abs() < 0.005);
        assert!((r.y - 20.0).abs() < 0.005);
        assert!((r.width - 100.0).abs() < 0.005);
        assert!((r.height - 50.0).abs() < 0.005);
    }

    #[test]
    fn includes_start_point_of_single_move_to() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 5.0, 7.0);
        let mut r = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_path_bounds(&path, &mut r);
        assert!((r.x - 5.0).abs() < 0.005);
        assert!((r.y - 7.0).abs() < 0.005);
        assert!(r.width.abs() < 0.005);
        assert!(r.height.abs() < 0.005);
    }

    #[test]
    fn expands_past_control_points_for_quadratic_curve() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_quadratic_curve_to(&mut path, 50.0, 100.0, 100.0, 0.0);
        let mut r = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_path_bounds(&path, &mut r);
        assert!(r.x.abs() < 0.005);
        assert!(r.y.abs() < 0.005);
        assert!((r.height - 50.0).abs() < 0.005);
        assert!((r.width - 100.0).abs() < 0.005);
    }

    #[test]
    fn expands_past_control_points_for_cubic_curve() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_cubic_curve_to(&mut path, 0.0, 100.0, 100.0, 100.0, 100.0, 0.0);
        let mut r = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_path_bounds(&path, &mut r);
        assert!(r.y.abs() < 0.005);
        assert!(r.height > 70.0);
        assert!(r.height < 100.0);
        assert!((r.width - 100.0).abs() < 0.005);
    }

    #[test]
    fn handles_move_and_line_spanning_multiple_quadrants() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, -50.0, -30.0);
        append_path_line_to(&mut path, 80.0, 60.0);
        let mut r = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_path_bounds(&path, &mut r);
        assert!((r.x - (-50.0)).abs() < 0.005);
        assert!((r.y - (-30.0)).abs() < 0.005);
        assert!((r.width - 130.0).abs() < 0.005);
        assert!((r.height - 90.0).abs() < 0.005);
    }
}
