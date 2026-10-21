use flight_path::contract::*;

mod clean_path {
    use super::*;

    #[test]
    fn removes_consecutive_duplicate_points() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 10.0, 0.0);
        append_path_line_to(&mut source, 10.0, 0.0);
        append_path_line_to(&mut source, 10.0, 10.0);
        let mut out = create_path(Some(PathWinding::NonZero));
        clean_path(&source, 0.001, &mut out, Some(0.25));
        assert_eq!(out.commands.len(), 3);
        assert_eq!(out.data, vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0]);
    }

    #[test]
    fn collapses_near_collinear_run_to_endpoints() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 25.0, 0.1);
        append_path_line_to(&mut source, 50.0, -0.1);
        append_path_line_to(&mut source, 75.0, 0.05);
        append_path_line_to(&mut source, 100.0, 0.0);
        let mut out = create_path(Some(PathWinding::NonZero));
        clean_path(&source, 1.0, &mut out, Some(0.25));
        assert_eq!(out.commands.len(), 2);
        assert_eq!(out.data, vec![0.0, 0.0, 100.0, 0.0]);
    }

    #[test]
    fn keeps_vertex_whose_deviation_exceeds_tolerance() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 10.0, 1.5);
        append_path_line_to(&mut source, 20.0, 0.0);
        let mut out = create_path(Some(PathWinding::NonZero));
        clean_path(&source, 1.0, &mut out, Some(0.25));
        assert_eq!(out.commands.len(), 3);
        assert_eq!(out.data, vec![0.0, 0.0, 10.0, 1.5, 20.0, 0.0]);
    }

    #[test]
    fn removes_vertex_whose_deviation_is_within_tolerance() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 10.0, 0.5);
        append_path_line_to(&mut source, 20.0, 0.0);
        let mut out = create_path(Some(PathWinding::NonZero));
        clean_path(&source, 1.0, &mut out, Some(0.25));
        assert_eq!(out.commands.len(), 2);
        assert_eq!(out.data, vec![0.0, 0.0, 20.0, 0.0]);
    }

    #[test]
    fn keeps_closed_contour_closed() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 10.0, 0.0);
        append_path_line_to(&mut source, 10.0, 10.0);
        append_path_line_to(&mut source, 0.0, 10.0);
        append_path_close(&mut source);
        let mut out = create_path(Some(PathWinding::NonZero));
        clean_path(&source, 0.001, &mut out, Some(0.25));
        assert!(out.commands.contains(&(PathCommand::Close as u8)));
        assert_eq!(out.data, vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0]);
    }

    #[test]
    fn keeps_non_collinear_spike_as_genuine_feature() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 10.0, 0.0);
        append_path_line_to(&mut source, 10.0, 10.0);
        append_path_line_to(&mut source, 6.0, 10.0);
        append_path_line_to(&mut source, 5.0, 20.0);
        append_path_line_to(&mut source, 4.0, 10.0);
        append_path_line_to(&mut source, 0.0, 10.0);
        append_path_close(&mut source);
        let mut out = create_path(Some(PathWinding::NonZero));
        clean_path(&source, 0.001, &mut out, Some(0.25));
        assert_eq!(out.data, vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 6.0, 10.0, 5.0, 20.0, 4.0, 10.0, 0.0, 10.0]);
    }

    #[test]
    fn preserves_non_degenerate_closed_triangle() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        append_path_line_to(&mut source, 50.0, 100.0);
        append_path_close(&mut source);
        let mut out = create_path(Some(PathWinding::NonZero));
        clean_path(&source, 0.5, &mut out, Some(0.25));
        assert!(out.commands.contains(&(PathCommand::Close as u8)));
    }

    #[test]
    fn cleans_in_place_when_out_is_same_as_source() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 5.0, 0.0);
        append_path_line_to(&mut path, 5.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        append_path_line_to(&mut path, 10.0, 10.0);
        append_path_line_to(&mut path, 0.0, 10.0);
        append_path_close(&mut path);
        let mut expected = create_path(Some(PathWinding::NonZero));
        clean_path(&path, 0.001, &mut expected, Some(0.25));
        clean_path(&path.clone(), 0.001, &mut path, Some(0.25));
        assert_eq!(path.commands, expected.commands);
        assert_eq!(path.data, expected.data);
    }

    #[test]
    fn removes_zero_area_out_and_back_spike() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 10.0, 0.0);
        append_path_line_to(&mut source, 10.0, 10.0);
        append_path_line_to(&mut source, 5.0, 10.0);
        append_path_line_to(&mut source, 5.0, 15.0);
        append_path_line_to(&mut source, 5.0, 10.0);
        append_path_line_to(&mut source, 0.0, 10.0);
        append_path_close(&mut source);
        let mut out = create_path(Some(PathWinding::NonZero));
        clean_path(&source, 0.001, &mut out, Some(0.25));
        assert!(out.commands.contains(&(PathCommand::Close as u8)));
        assert!(out.data.len() <= 8);
    }
}
