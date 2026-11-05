use flight_path::contract::*;

fn count_commands(path: &Path, command: PathCommand) -> usize {
    let mut count = 0;
    for &candidate in &path.commands {
        if candidate == command as u8 {
            count += 1;
        }
    }
    return count;
}

mod fit_path_curves {
    use super::*;

    // Corner detection compares the cosine of the turn, `dot / (len0 * len1)`, so an 80-degree bend
    // between long segments is a corner and both sides stay straight lines through it.
    #[test]
    fn keeps_a_sharp_bend_between_long_segments_as_a_corner() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 50.0, 0.0);
        append_path_line_to(&mut source, 58.68240888334652, 49.2403876506104);
        let mut out = create_path(Some(PathWinding::NonZero));
        fit_path_curves(&source, 1.0, &mut out, Some(0.25));
        assert_eq!(
            out.commands,
            vec![
                PathCommand::MOVE_TO as u8,
                PathCommand::LINE_TO as u8,
                PathCommand::LINE_TO as u8
            ]
        );
        assert_eq!(out.data[2], 50.0);
        assert_eq!(out.data[3], 0.0);
    }

    // The least-squares residual subtracts the whole endpoint-only Bezier from each sample, so a
    // sampled quarter arc fits as one cubic with symmetric control points.
    #[test]
    fn fits_a_sampled_quarter_arc_with_one_least_squares_cubic() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 100.0, 0.0);
        for i in 1..=8 {
            let angle = (i as f64) / 8.0 * std::f64::consts::FRAC_PI_2;
            append_path_line_to(&mut source, 100.0 * angle.cos(), 100.0 * angle.sin());
        }
        let mut out = create_path(Some(PathWinding::NonZero));
        fit_path_curves(&source, 2.0, &mut out, Some(0.25));
        assert_eq!(
            out.commands,
            vec![
                PathCommand::MOVE_TO as u8,
                PathCommand::CUBIC_CURVE_TO as u8
            ]
        );
        assert!((out.data[2] - 94.00561852266638).abs() < 1e-9);
        assert!((out.data[3] - 60.861976507694955).abs() < 1e-9);
        assert!((out.data[4] - 60.86197650769494).abs() < 1e-9);
        assert!((out.data[5] - 94.00561852266638).abs() < 1e-9);
    }

    #[test]
    fn keeps_straight_line_as_line() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 50.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        let mut out = create_path(Some(PathWinding::NonZero));
        fit_path_curves(&source, 1.0, &mut out, Some(0.25));
        assert_eq!(out.commands[0], PathCommand::MOVE_TO as u8);
        assert!(!out.commands.contains(&(PathCommand::CLOSE as u8)));
        let last_x = out.data[out.data.len() - 2];
        let last_y = out.data[out.data.len() - 1];
        assert!((last_x - 100.0).abs() < 0.005);
        assert!(last_y.abs() < 0.005);
    }

    #[test]
    fn produces_smooth_curves_from_circle_like_polyline() {
        let mut source = create_path(Some(PathWinding::NonZero));
        let n = 16;
        let r = 50.0;
        for i in 0..n {
            let angle = (i as f64 / n as f64) * std::f64::consts::PI * 2.0;
            let x = angle.cos() * r;
            let y = angle.sin() * r;
            if i == 0 {
                append_path_move_to(&mut source, x, y);
            } else {
                append_path_line_to(&mut source, x, y);
            }
        }
        let mut out = create_path(Some(PathWinding::NonZero));
        fit_path_curves(&source, 1.0, &mut out, Some(0.25));
        let cubic_count = count_commands(&out, PathCommand::CUBIC_CURVE_TO);
        assert!(cubic_count > 0);
        assert!(cubic_count < n);
    }

    #[test]
    fn handles_single_segment() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 100.0);
        let mut out = create_path(Some(PathWinding::NonZero));
        fit_path_curves(&source, 1.0, &mut out, Some(0.25));
        assert_eq!(out.commands[0], PathCommand::MOVE_TO as u8);
        assert!(out.data.contains(&100.0));
    }

    #[test]
    fn handles_empty_path() {
        let source = create_path(Some(PathWinding::NonZero));
        let mut out = create_path(Some(PathWinding::NonZero));
        fit_path_curves(&source, 1.0, &mut out, Some(0.25));
        assert!(out.commands.is_empty());
    }

    #[test]
    fn preserves_winding_rule() {
        let mut source = create_path(Some(PathWinding::NonZero));
        source.winding = PathWinding::EvenOdd;
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        append_path_line_to(&mut source, 100.0, 100.0);
        let mut out = create_path(Some(PathWinding::NonZero));
        fit_path_curves(&source, 1.0, &mut out, Some(0.25));
        assert_eq!(out.winding, PathWinding::EvenOdd);
    }

    #[test]
    fn is_alias_safe_when_source_and_out_are_same() {
        let mut path = create_path(Some(PathWinding::NonZero));
        path.winding = PathWinding::EvenOdd;
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 25.0, 20.0);
        append_path_line_to(&mut path, 50.0, 30.0);
        append_path_line_to(&mut path, 75.0, 20.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut expected = create_path(Some(PathWinding::NonZero));
        fit_path_curves(&path, 1.0, &mut expected, Some(0.25));
        fit_path_curves(&path.clone(), 1.0, &mut path, Some(0.25));
        assert_eq!(path.commands, expected.commands);
        assert_eq!(path.data, expected.data);
        assert_eq!(path.winding, expected.winding);
    }

    #[test]
    fn produces_cubics_from_polyline() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 20.0, 30.0);
        append_path_line_to(&mut source, 50.0, 40.0);
        append_path_line_to(&mut source, 80.0, 30.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        let mut out = create_path(Some(PathWinding::NonZero));
        fit_path_curves(&source, 1.0, &mut out, Some(0.25));
        let has_cubic = out
            .commands
            .iter()
            .any(|&c| c == PathCommand::CUBIC_CURVE_TO as u8);
        assert!(has_cubic);
    }
}
