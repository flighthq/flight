use flight_path::contract::*;

mod decimate_path {
    use super::*;

    #[test]
    fn keeps_straight_line_unchanged() {
        let mut source = create_path();
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 50.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        let mut out = create_path();
        decimate_path(&source, 1.0, &mut out, Some(0.25));
        assert_eq!(out.commands.len(), 2);
        assert_eq!(out.data[0], 0.0);
        assert_eq!(out.data[out.data.len() - 2], 100.0);
    }

    #[test]
    fn simplifies_noisy_straight_line() {
        let mut source = create_path();
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 25.0, 0.1);
        append_path_line_to(&mut source, 50.0, -0.1);
        append_path_line_to(&mut source, 75.0, 0.05);
        append_path_line_to(&mut source, 100.0, 0.0);
        let mut out = create_path();
        decimate_path(&source, 1.0, &mut out, Some(0.25));
        assert_eq!(out.commands.len(), 2);
        assert_eq!(out.data[0], 0.0);
        assert_eq!(out.data[out.data.len() - 2], 100.0);
    }

    #[test]
    fn keeps_all_points_when_tolerance_is_zero() {
        let mut source = create_path();
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 50.0, 10.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        let mut out = create_path();
        decimate_path(&source, 0.0, &mut out, Some(0.25));
        assert_eq!(out.commands.len(), 3);
        assert_eq!(out.data, vec![0.0, 0.0, 50.0, 10.0, 100.0, 0.0]);
    }

    #[test]
    fn preserves_closed_paths() {
        let mut source = create_path();
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        append_path_line_to(&mut source, 100.0, 100.0);
        append_path_line_to(&mut source, 0.0, 100.0);
        append_path_close(&mut source);
        let mut out = create_path();
        decimate_path(&source, 1.0, &mut out, Some(0.25));
        assert_eq!(*out.commands.last().unwrap(), PathCommand::Close as u8);
    }

    #[test]
    fn preserves_winding_rule() {
        let mut source = create_path();
        source.winding = PathWinding::EvenOdd;
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        let mut out = create_path();
        decimate_path(&source, 1.0, &mut out, Some(0.25));
        assert_eq!(out.winding, PathWinding::EvenOdd);
    }

    #[test]
    fn handles_empty_path() {
        let source = create_path();
        let mut out = create_path();
        decimate_path(&source, 1.0, &mut out, Some(0.25));
        assert!(out.commands.is_empty());
    }

    #[test]
    fn is_alias_safe_when_source_and_out_are_same() {
        let mut path = create_path();
        path.winding = PathWinding::EvenOdd;
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 25.0, 0.1);
        append_path_line_to(&mut path, 50.0, -0.1);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut expected = create_path();
        decimate_path(&path, 1.0, &mut expected, Some(0.25));
        decimate_path(&path.clone(), 1.0, &mut path, Some(0.25));
        assert_eq!(path.commands, expected.commands);
        assert_eq!(path.data, expected.data);
        assert_eq!(path.winding, expected.winding);
    }

    #[test]
    fn preserves_distinct_corners() {
        let mut source = create_path();
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        append_path_line_to(&mut source, 100.0, 100.0);
        let mut out = create_path();
        decimate_path(&source, 1.0, &mut out, Some(0.25));
        let contours = flatten_path(&out, Some(0.25));
        assert_eq!(contours[0].len() / 2, 3);
    }
}
