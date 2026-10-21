use flight_path::contract::*;

mod reverse_path_test {
    use super::*;

    #[test]
    fn reverses_simple_open_polyline() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 10.0, 0.0);
        append_path_line_to(&mut source, 10.0, 10.0);
        let mut out = create_path(Some(PathWinding::NonZero));
        reverse_path(&source, &mut out);
        assert_eq!(out.data, vec![10.0, 10.0, 10.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn preserves_closed_flag() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 10.0, 0.0);
        append_path_line_to(&mut source, 10.0, 10.0);
        append_path_close(&mut source);
        let mut out = create_path(Some(PathWinding::NonZero));
        reverse_path(&source, &mut out);
        assert_eq!(*out.commands.last().unwrap(), PathCommand::Close as u8);
    }

    #[test]
    fn copies_winding_rule() {
        let mut source = create_path(Some(PathWinding::EvenOdd));
        append_path_move_to(&mut source, 0.0, 0.0);
        append_path_line_to(&mut source, 1.0, 0.0);
        let mut out = create_path(Some(PathWinding::NonZero));
        reverse_path(&source, &mut out);
        assert_eq!(out.winding, PathWinding::EvenOdd);
    }

    #[test]
    fn is_alias_safe_when_out_is_same_as_source() {
        let mut path = create_path(Some(PathWinding::EvenOdd));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        append_path_line_to(&mut path, 20.0, 10.0);
        append_path_close(&mut path);
        let mut expected = create_path(Some(PathWinding::NonZero));
        reverse_path(&path, &mut expected);
        reverse_path(&path.clone(), &mut path);
        assert_eq!(path.commands, expected.commands);
        assert_eq!(path.data, expected.data);
        assert_eq!(path.winding, expected.winding);
    }
}
