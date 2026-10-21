use flight_path::contract::*;

mod fit_path_curves {
    use super::*;

    #[test]
    fn keeps_straight_line_as_line() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 50.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        let mut out = create_path(Some(PathWinding::NonZero));
        fit_path_curves(&source, 1.0, &mut out, 0.25);
        assert_eq!(out.commands[0], PathCommand::MoveTo as u8);
        assert!(!out.commands.contains(&(PathCommand::Close as u8)));
        let last_x = out.data[out.data.len() - 2];
        let last_y = out.data[out.data.len() - 1];
        assert!((last_x - 100.0).abs() < 0.5);
        assert!(last_y.abs() < 0.5);
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
        fit_path_curves(&source, 1.0, &mut out, 0.25);
        let cubic_count = out.commands.iter()
            .filter(|&&c| c == PathCommand::CubicCurveTo as u8)
            .count();
        assert!(cubic_count > 0);
        assert!(cubic_count < n);
    }

    #[test]
    fn handles_single_segment() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 100.0);
        let mut out = create_path(Some(PathWinding::NonZero));
        fit_path_curves(&source, 1.0, &mut out, 0.25);
        assert_eq!(out.commands[0], PathCommand::MoveTo as u8);
        assert!(out.data.contains(&100.0));
    }

    #[test]
    fn handles_empty_path() {
        let source = create_path(Some(PathWinding::NonZero));
        let mut out = create_path(Some(PathWinding::NonZero));
        fit_path_curves(&source, 1.0, &mut out, 0.25);
        assert!(out.commands.is_empty());
    }

    #[test]
    fn preserves_winding_rule() {
        let mut source = create_path(Some(PathWinding::EvenOdd));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        append_path_line_to(&mut source, 100.0, 100.0);
        let mut out = create_path(Some(PathWinding::NonZero));
        fit_path_curves(&source, 1.0, &mut out, 0.25);
        assert_eq!(out.winding, PathWinding::EvenOdd);
    }

    #[test]
    fn is_alias_safe_when_source_and_out_are_same() {
        let mut path = create_path(Some(PathWinding::EvenOdd));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 25.0, 20.0);
        append_path_line_to(&mut path, 50.0, 30.0);
        append_path_line_to(&mut path, 75.0, 20.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut expected = create_path(Some(PathWinding::NonZero));
        fit_path_curves(&path, 1.0, &mut expected, 0.25);
        fit_path_curves(&path.clone(), 1.0, &mut path, 0.25);
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
        fit_path_curves(&source, 1.0, &mut out, 0.25);
        let has_cubic = out.commands.iter().any(|&c| c == PathCommand::CubicCurveTo as u8);
        assert!(has_cubic);
    }
}
