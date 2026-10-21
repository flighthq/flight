use flight_path::contract::*;

mod clone_path {
    use super::*;

    #[test]
    fn returns_new_path_with_same_commands_and_data() {
        let mut source = create_path(Some(PathWinding::EvenOdd));
        append_path_rectangle(&mut source, 0.0, 0.0, 100.0, 50.0);
        let cloned = clone_path(&source);
        assert_eq!(cloned.commands, source.commands);
        assert_eq!(cloned.data, source.data);
        assert_eq!(cloned.winding, PathWinding::EvenOdd);
    }

    #[test]
    fn mutations_to_clone_do_not_affect_source() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 0.0, 0.0);
        let mut cloned = clone_path(&source);
        cloned.commands.push(99);
        assert_eq!(source.commands.len(), 1);
    }

    #[test]
    fn allocates_independent_storage_and_entity_identity() {
        let mut source = create_path(None);
        append_path_move_to(&mut source, 5.0, 10.0);
        let mut result = clone_path(&source);
        assert_ne!(
            flight_entity::get_entity_uid(&mut result),
            flight_entity::get_entity_uid(&mut source)
        );
        assert_ne!(result.commands.as_ptr(), source.commands.as_ptr());
        assert_ne!(result.data.as_ptr(), source.data.as_ptr());
        assert_eq!(result.commands, source.commands);
        assert_eq!(result.data, source.data);
    }
}

mod copy_path {
    use super::*;

    #[test]
    fn writes_into_required_out_with_same_contents() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 5.0, 10.0);
        let mut result = create_path(None);
        copy_path(&mut result, &source);
        assert_eq!(result.commands, source.commands);
        assert_eq!(result.data, source.data);
    }

    #[test]
    fn preserves_destination_identity_and_existing_field_storage() {
        let mut source = create_path(Some(PathWinding::EvenOdd));
        append_path_move_to(&mut source, 1.0, 2.0);
        append_path_line_to(&mut source, 3.0, 4.0);
        let mut out = create_path(None);
        append_path_rectangle(&mut out, 10.0, 20.0, 30.0, 40.0);
        let uid = flight_entity::get_entity_uid(&mut out);
        let commands = out.commands.as_ptr();
        let data = out.data.as_ptr();
        copy_path(&mut out, &source);
        assert_eq!(flight_entity::get_entity_uid(&mut out), uid);
        assert_eq!(out.commands.as_ptr(), commands);
        assert_eq!(out.data.as_ptr(), data);
        assert_eq!(out.commands, source.commands);
        assert_eq!(out.data, source.data);
        assert_eq!(out.winding, PathWinding::EvenOdd);
    }

    #[test]
    fn clears_existing_data_when_source_is_empty() {
        let source = create_path(Some(PathWinding::EvenOdd));
        let mut out = create_path(None);
        append_path_rectangle(&mut out, 10.0, 20.0, 30.0, 40.0);
        copy_path(&mut out, &source);
        assert!(out.commands.is_empty());
        assert!(out.data.is_empty());
        assert_eq!(out.winding, PathWinding::EvenOdd);
    }
}

mod copy_path_into {
    use super::*;

    #[test]
    fn writes_into_out_with_correct_winding() {
        let mut source = create_path(Some(PathWinding::EvenOdd));
        append_path_move_to(&mut source, 1.0, 2.0);
        append_path_line_to(&mut source, 3.0, 4.0);
        let mut out = create_path(Some(PathWinding::NonZero));
        copy_path_into(&mut out, &source);
        assert_eq!(out.commands, source.commands);
        assert_eq!(out.data, source.data);
        assert_eq!(out.winding, PathWinding::EvenOdd);
    }

    #[test]
    fn preserves_contents_when_copying_a_snapshot() {
        let mut source = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut source, 7.0, 8.0);
        let cmds_before = source.commands.clone();
        let data_before = source.data.clone();
        let snapshot = source.clone();
        copy_path_into(&mut source, &snapshot);
        assert_eq!(source.commands, cmds_before);
        assert_eq!(source.data, data_before);
    }

    #[test]
    fn copies_into_existing_path() {
        let mut source = create_path(Some(PathWinding::EvenOdd));
        append_path_move_to(&mut source, 5.0, 6.0);
        let mut out = create_path(Some(PathWinding::NonZero));
        copy_path_into(&mut out, &source);
        assert_eq!(out.commands, source.commands);
        assert_eq!(out.data, source.data);
        assert_eq!(out.winding, PathWinding::EvenOdd);
    }
}
