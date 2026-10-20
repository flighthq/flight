use flight_path::*;

mod clone_path_test {
    use super::*;

    #[test]
    fn returns_deep_copy_of_path() {
        let mut source = create_path(PathWinding::EvenOdd);
        append_path_move_to(&mut source, 1.0, 2.0);
        append_path_line_to(&mut source, 3.0, 4.0);
        let cloned = clone_path(&source);
        assert_eq!(cloned.commands, source.commands);
        assert_eq!(cloned.data, source.data);
        assert_eq!(cloned.winding, source.winding);
    }
}

mod copy_path_test {
    use super::*;

    #[test]
    fn returns_deep_copy() {
        let mut source = create_path(PathWinding::NonZero);
        append_path_move_to(&mut source, 10.0, 20.0);
        let copied = copy_path(&source);
        assert_eq!(copied.commands, source.commands);
        assert_eq!(copied.data, source.data);
    }
}

mod copy_path_into_test {
    use super::*;

    #[test]
    fn copies_into_existing_path() {
        let mut source = create_path(PathWinding::EvenOdd);
        append_path_move_to(&mut source, 5.0, 6.0);
        let mut out = create_path(PathWinding::NonZero);
        copy_path_into(&source, &mut out);
        assert_eq!(out.commands, source.commands);
        assert_eq!(out.data, source.data);
        assert_eq!(out.winding, PathWinding::EvenOdd);
    }
}
