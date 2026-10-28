use flight_path::contract::*;

fn flattened_path(path: &Path, tolerance: Option<f64>) -> Vec<Vec<f64>> {
    let mut out = Vec::new();
    flight_path::flatten_path(&mut out, path, tolerance);
    return out;
}

fn ts_wire_path(commands: Vec<u8>, data: Vec<f64>) -> Path {
    let mut path = create_path(PathWinding::NonZero);
    path.commands = commands;
    path.data = data;
    return path;
}

mod flatten_path {
    use super::*;

    #[test]
    fn flattens_ts_serialized_bytes_like_the_writer_built_path() {
        let raw = ts_wire_path(
            vec![1, 2, 0, 2, 2, 7],
            vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0],
        );
        let mut built = create_path(PathWinding::NonZero);
        append_path_move_to(&mut built, 0.0, 0.0);
        append_path_line_to(&mut built, 10.0, 0.0);
        append_path_line_to(&mut built, 10.0, 10.0);
        append_path_line_to(&mut built, 0.0, 10.0);
        append_path_close(&mut built);
        assert_eq!(flattened_path(&raw, None), flattened_path(&built, None));
        assert_eq!(flattened_path(&raw, None).len(), 1);
    }

    #[test]
    fn returns_empty_for_empty_path() {
        let path = create_path(PathWinding::NonZero);
        let contours = flattened_path(&path, Some(0.25));
        assert!(contours.is_empty());
    }

    #[test]
    fn clears_and_reuses_the_callers_outer_contour_buffer() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut path, 0.0, 0.0, 10.0, 20.0);
        let mut out = Vec::with_capacity(4);
        out.push(vec![999.0]);
        let allocation = out.as_ptr();
        let capacity = out.capacity();

        flight_path::flatten_path(&mut out, &path, Some(0.25));

        assert_eq!(out.len(), 1);
        assert_eq!(
            out[0],
            vec![0.0, 0.0, 10.0, 0.0, 10.0, 20.0, 0.0, 20.0, 0.0, 0.0]
        );
        assert_eq!(out.as_ptr(), allocation);
        assert_eq!(out.capacity(), capacity);

        flight_path::flatten_path(&mut out, &create_path(PathWinding::NonZero), Some(0.25));
        assert!(out.is_empty());
        assert_eq!(out.as_ptr(), allocation);
    }

    #[test]
    fn flattens_straight_line_to_its_two_endpoints() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let contours = flattened_path(&path, Some(0.25));
        assert_eq!(contours, vec![vec![0.0, 0.0, 100.0, 0.0]]);
    }

    #[test]
    fn produces_one_contour_per_subpath() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        append_path_move_to(&mut path, 0.0, 10.0);
        append_path_line_to(&mut path, 10.0, 10.0);
        let contours = flattened_path(&path, Some(0.25));
        assert_eq!(
            contours,
            vec![vec![0.0, 0.0, 10.0, 0.0], vec![0.0, 10.0, 10.0, 10.0]]
        );
    }

    #[test]
    fn collapses_quadratic_on_chord_to_just_the_endpoint() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_quadratic_curve_to(&mut path, 50.0, 0.0, 100.0, 0.0);
        let contours = flattened_path(&path, Some(0.25));
        assert_eq!(contours, vec![vec![0.0, 0.0, 100.0, 0.0]]);
    }

    #[test]
    fn reads_second_coordinate_pair_for_wide_verbs() {
        let mut path = create_path(PathWinding::NonZero);
        path.commands.push(PathCommand::WideMoveTo as u8);
        path.data.push(0.0);
        path.data.push(0.0);
        path.data.push(5.0);
        path.data.push(6.0);
        path.commands.push(PathCommand::WideLineTo as u8);
        path.data.push(0.0);
        path.data.push(0.0);
        path.data.push(7.0);
        path.data.push(8.0);
        let contours = flattened_path(&path, Some(0.25));
        assert_eq!(contours, vec![vec![5.0, 6.0, 7.0, 8.0]]);
    }

    #[test]
    fn subdivides_genuinely_curved_quadratic_keeping_endpoints() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_quadratic_curve_to(&mut path, 50.0, 50.0, 100.0, 0.0);
        let contour = &flattened_path(&path, Some(0.25))[0];
        assert!(contour.len() > 4);
        assert_eq!(contour[0], 0.0);
        assert_eq!(contour[1], 0.0);
        assert_eq!(contour[contour.len() - 2], 100.0);
        assert_eq!(contour[contour.len() - 1], 0.0);
    }

    #[test]
    fn emits_fewer_points_at_coarser_tolerance() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_quadratic_curve_to(&mut path, 50.0, 50.0, 100.0, 0.0);
        let fine = flattened_path(&path, Some(0.1))[0].len();
        let coarse = flattened_path(&path, Some(50.0))[0].len();
        assert!(coarse < fine);
    }

    #[test]
    fn appends_start_point_when_close_verb_is_present() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 100.0, 100.0);
        append_path_close(&mut path);
        let contour = &flattened_path(&path, Some(0.25))[0];
        assert_eq!(contour[contour.len() - 2], 0.0);
        assert_eq!(contour[contour.len() - 1], 0.0);
    }

    #[test]
    fn does_not_duplicate_start_when_close_at_same_position() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 0.0, 0.0);
        append_path_close(&mut path);
        let contour = &flattened_path(&path, Some(0.25))[0];
        assert_eq!(contour.len(), 6);
    }

    #[test]
    fn subdivides_cubic_curves() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_cubic_curve_to(&mut path, 33.0, 100.0, 66.0, 100.0, 100.0, 0.0);
        let contours = flattened_path(&path, Some(0.25));
        assert_eq!(contours.len(), 1);
        assert!(contours[0].len() > 4);
    }
}
