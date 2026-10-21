use flight_path::*;

mod dash_path_test {
    use super::*;

    #[test]
    fn produces_dashed_segments_from_simple_line() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        let mut out = create_path(Some(PathWinding::NonZero));
        dash_path(&source, &[10.0, 5.0], 0.0, &mut out, 0.25);
        let move_count = out.commands.iter().filter(|&&c| c == PathCommand::MoveTo as u8).count();
        assert!(move_count >= 6);
        assert!(!out.commands.contains(&(PathCommand::Close as u8)));
    }

    #[test]
    fn copies_unchanged_for_empty_dash_array() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 50.0, 50.0);
        let mut out = create_path(Some(PathWinding::NonZero));
        dash_path(&source, &[], 0.0, &mut out, 0.25);
        assert_eq!(out.commands, source.commands);
        assert_eq!(out.data, source.data);
    }

    #[test]
    fn handles_closed_path() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        append_path_line_to(&mut source, 100.0, 100.0);
        append_path_close(&mut source);
        let mut out = create_path(Some(PathWinding::NonZero));
        dash_path(&source, &[20.0, 10.0], 0.0, &mut out, 0.25);
        let move_count = out.commands.iter().filter(|&&c| c == PathCommand::MoveTo as u8).count();
        assert!(move_count >= 2);
    }

    #[test]
    fn applies_dash_offset_correctly() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        let mut no_offset = create_path(Some(PathWinding::NonZero));
        dash_path(&source, &[10.0, 10.0], 0.0, &mut no_offset, 0.25);
        let mut with_offset = create_path(Some(PathWinding::NonZero));
        dash_path(&source, &[10.0, 10.0], 5.0, &mut with_offset, 0.25);
        assert_ne!(with_offset.data, no_offset.data);
    }

    #[test]
    fn handles_zero_length_segments_in_dash_array() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 50.0, 0.0);
        let mut out = create_path(Some(PathWinding::NonZero));
        dash_path(&source, &[10.0, 0.0], 0.0, &mut out, 0.25);
        assert!(!out.commands.is_empty());
    }

    #[test]
    fn is_alias_safe_when_source_and_out_are_same() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 100.0, 100.0);
        let mut expected = create_path(Some(PathWinding::NonZero));
        dash_path(&path, &[15.0, 10.0], 0.0, &mut expected, 0.25);
        dash_path(&path.clone(), &[15.0, 10.0], 0.0, &mut path, 0.25);
        assert_eq!(path.commands, expected.commands);
        assert_eq!(path.data, expected.data);
    }

    #[test]
    fn does_not_mutate_source() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        append_path_line_to(&mut source, 100.0, 100.0);
        let original_commands = source.commands.clone();
        let original_data = source.data.clone();
        let mut out = create_path(Some(PathWinding::NonZero));
        dash_path(&source, &[15.0, 10.0], 0.0, &mut out, 0.25);
        assert_eq!(source.commands, original_commands);
        assert_eq!(source.data, original_data);
    }

    #[test]
    fn preserves_winding_rule() {
        let mut source = create_path(Some(PathWinding::EvenOdd));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        let mut out = create_path(Some(PathWinding::NonZero));
        dash_path(&source, &[10.0, 5.0], 0.0, &mut out, 0.25);
        assert_eq!(out.winding, PathWinding::EvenOdd);
    }

    #[test]
    fn produces_multiple_segments_for_multiline_path() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        append_path_line_to(&mut source, 100.0, 100.0);
        let mut out = create_path(Some(PathWinding::NonZero));
        dash_path(&source, &[15.0, 10.0], 0.0, &mut out, 0.25);
        let move_count = out.commands.iter().filter(|&&c| c == PathCommand::MoveTo as u8).count();
        assert!(move_count >= 2);
    }
}
