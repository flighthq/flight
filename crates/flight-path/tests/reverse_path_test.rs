use flight_path::*;

mod reverse_path_test {
    use super::*;

    #[test]
    fn reverses_line_path_endpoints() {
        let mut source = create_path(PathWinding::NonZero);
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        let mut out = create_path(PathWinding::NonZero);
        reverse_path(&source, &mut out);
        assert_eq!(out.data[0], 100.0);
        assert_eq!(out.data[1], 0.0);
        assert_eq!(out.data[2], 0.0);
        assert_eq!(out.data[3], 0.0);
    }

    #[test]
    fn preserves_close_command() {
        let mut source = create_path(PathWinding::NonZero);
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        append_path_line_to(&mut source, 100.0, 100.0);
        append_path_close(&mut source);
        let mut out = create_path(PathWinding::NonZero);
        reverse_path(&source, &mut out);
        assert!(out.commands.contains(&(PathCommand::Close as u8)));
    }

    #[test]
    fn preserves_winding() {
        let mut source = create_path(PathWinding::EvenOdd);
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 100.0, 0.0);
        let mut out = create_path(PathWinding::NonZero);
        reverse_path(&source, &mut out);
        assert_eq!(out.winding, PathWinding::EvenOdd);
    }
}
