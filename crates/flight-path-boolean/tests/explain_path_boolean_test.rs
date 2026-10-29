use flight_path::*;
use flight_path_boolean::contract::*;

mod explain_offset_path {
    use super::*;

    #[test]
    fn distinguishes_empty_invalid_collapsed_and_viable_results() {
        let kernel = create_martinez_path_boolean_kernel();

        let empty = create_path(Some(flight_path::PathWinding::NonZero));
        let result = explain_offset_path(&kernel, &empty, 1.0, None);
        assert!(result.is_some());
        assert_eq!(
            result.unwrap().reason,
            PathBooleanExplanationReason::EmptyInput
        );

        let mut sq = create_path(Some(flight_path::PathWinding::NonZero));
        append_path_move_to(&mut sq, 0.0, 0.0);
        append_path_line_to(&mut sq, 1.0, 0.0);
        append_path_line_to(&mut sq, 1.0, 1.0);
        append_path_line_to(&mut sq, 0.0, 1.0);
        append_path_close(&mut sq);

        let nan_result = explain_offset_path(&kernel, &sq, f64::NAN, None);
        assert!(nan_result.is_some());
        assert_eq!(
            nan_result.unwrap().reason,
            PathBooleanExplanationReason::NonFiniteDelta
        );

        let collapsed = explain_offset_path(&kernel, &sq, -1.0, None);
        assert!(collapsed.is_some());
        assert_eq!(
            collapsed.unwrap().reason,
            PathBooleanExplanationReason::CollapsedOrDegenerate
        );

        let viable = explain_offset_path(&kernel, &sq, 1.0, None);
        assert!(viable.is_none());
    }
}

mod explain_simplify_path {
    use super::*;

    #[test]
    fn distinguishes_empty_input_from_a_viable_region() {
        let kernel = create_martinez_path_boolean_kernel();

        let empty = create_path(Some(flight_path::PathWinding::NonZero));
        let result = explain_simplify_path(&kernel, &empty, None);
        assert!(result.is_some());
        assert_eq!(
            result.unwrap().reason,
            PathBooleanExplanationReason::EmptyInput
        );

        let mut triangle = create_path(Some(flight_path::PathWinding::NonZero));
        append_path_move_to(&mut triangle, 0.0, 0.0);
        append_path_line_to(&mut triangle, 1.0, 0.0);
        append_path_line_to(&mut triangle, 0.0, 1.0);
        append_path_close(&mut triangle);

        let viable = explain_simplify_path(&kernel, &triangle, None);
        assert!(viable.is_none());
    }
}
