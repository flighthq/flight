use flight_path::*;

mod dash_path_test {
    use super::*;

    #[test]
    fn copies_unchanged_for_empty_dash() {
        let mut source = create_path(PathWinding::NonZero);
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        let mut out = create_path(PathWinding::NonZero);
        dash_path(&source, &[], 0.0, &mut out, 0.25);
        assert_eq!(out.commands.len(), source.commands.len());
    }

    #[test]
    fn produces_dashed_segments() {
        let mut source = create_path(PathWinding::NonZero);
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        let mut out = create_path(PathWinding::NonZero);
        dash_path(&source, &[10.0, 10.0], 0.0, &mut out, 0.25);
        let move_count = out.commands.iter().filter(|&&c| c == PathCommand::MoveTo as u8).count();
        assert!(move_count >= 3);
    }
}
