use flight_path::contract::*;

mod build_path_morph {
    use super::*;

    #[test]
    fn succeeds_for_compatible_closed_paths() {
        let mut start = create_path();
        append_path_rectangle(&mut start, 0.0, 0.0, 100.0, 100.0);
        let mut end = create_path();
        append_path_rectangle(&mut end, 50.0, 50.0, 200.0, 200.0);
        let result = build_path_morph(&start, &end);
        assert_eq!(result.issue, PathMorphCreationReason::Ok);
        assert!(result.morph.is_some());
    }

    #[test]
    fn returns_success_for_compatible_open_paths() {
        let mut start = create_path();
        append_path_move_to(&mut start, 0.0, 0.0);
        append_path_line_to(&mut start, 1.0, 0.0);
        let mut end = create_path();
        append_path_move_to(&mut end, 0.0, 0.0);
        append_path_line_to(&mut end, 2.0, 0.0);
        let result = build_path_morph(&start, &end);
        assert_eq!(result.issue, PathMorphCreationReason::Ok);
        assert!(result.morph.is_some());
    }

    #[test]
    fn fails_for_winding_mismatch() {
        let mut start = create_path();
        append_path_rectangle(&mut start, 0.0, 0.0, 100.0, 100.0);
        let mut end = create_path();
        end.winding = PathWinding::EvenOdd;
        append_path_rectangle(&mut end, 0.0, 0.0, 100.0, 100.0);
        let result = build_path_morph(&start, &end);
        assert_eq!(result.issue, PathMorphCreationReason::WindingMismatch);
        assert!(result.morph.is_none());
    }

    #[test]
    fn fails_for_contour_count_mismatch() {
        let mut start = create_path();
        append_path_rectangle(&mut start, 0.0, 0.0, 100.0, 100.0);
        let mut end = create_path();
        append_path_rectangle(&mut end, 0.0, 0.0, 100.0, 100.0);
        append_path_rectangle(&mut end, 200.0, 200.0, 50.0, 50.0);
        let result = build_path_morph(&start, &end);
        assert_eq!(result.issue, PathMorphCreationReason::ContourCountMismatch);
    }
}

mod initialize_path_morph {
    use super::*;

    #[test]
    fn writes_commands_data_and_winding() {
        let mut out: PathMorph = flight_entity::allocate_entity();
        initialize_path_morph(&mut out, vec![1, 6], vec![0.0, 1.0], vec![2.0, 3.0], PathWinding::EvenOdd);
        assert_eq!(out.commands, vec![1, 6]);
        assert_eq!(out.end_data, vec![0.0, 1.0]);
        assert_eq!(out.start_data, vec![2.0, 3.0]);
        assert_eq!(out.winding, PathWinding::EvenOdd);
    }
}
