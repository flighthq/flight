use flight_path::*;

mod clone_path_test {
    use super::*;

    #[test]
    fn returns_new_path_with_same_commands_and_data() {
        let mut source = create_path(PathWinding::EvenOdd);
        append_path_rectangle(&mut source, 0.0, 0.0, 100.0, 50.0);
        let cloned = clone_path(&source);
        assert_eq!(cloned.commands, source.commands);
        assert_eq!(cloned.data, source.data);
        assert_eq!(cloned.winding, PathWinding::EvenOdd);
    }

    #[test]
    fn mutations_to_clone_do_not_affect_source() {
        let mut source = create_path(PathWinding::NonZero);
        append_path_move_to(&mut source, 0.0, 0.0);
        let mut cloned = clone_path(&source);
        cloned.commands.push(99);
        assert_eq!(source.commands.len(), 1);
    }
}

mod copy_path_test {
    use super::*;

    #[test]
    fn allocates_new_path_with_same_contents() {
        let mut source = create_path(PathWinding::NonZero);
        append_path_move_to(&mut source, 5.0, 10.0);
        let result = copy_path(&source);
        assert_eq!(result.commands, source.commands);
        assert_eq!(result.data, source.data);
    }
}

mod copy_path_into_test {
    use super::*;

    #[test]
    fn writes_into_out_with_correct_winding() {
        let mut source = create_path(PathWinding::EvenOdd);
        append_path_move_to(&mut source, 1.0, 2.0);
        append_path_line_to(&mut source, 3.0, 4.0);
        let mut out = create_path(PathWinding::NonZero);
        copy_path_into(&source, &mut out);
        assert_eq!(out.commands, source.commands);
        assert_eq!(out.data, source.data);
        assert_eq!(out.winding, PathWinding::EvenOdd);
    }

    #[test]
    fn is_no_op_when_out_is_same_as_source() {
        let mut source = create_path(PathWinding::NonZero);
        append_path_move_to(&mut source, 7.0, 8.0);
        let cmds_before = source.commands.clone();
        let data_before = source.data.clone();
        copy_path_into(&source.clone(), &mut source);
        assert_eq!(source.commands, cmds_before);
        assert_eq!(source.data, data_before);
    }

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
