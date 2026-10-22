use flight_path::*;
use flight_path_boolean::contract::*;

mod explain_offset_path {
    use super::*;

    #[test]
    fn distinguishes_empty_invalid_collapsed_and_viable_results() {
        let kernel = create_martinez_path_boolean_kernel();

        let empty = create_path();
        let result = explain_offset_path(&kernel, &empty, 1.0, None);
        assert!(result.is_some());
        assert_eq!(
            result.unwrap().reason,
            PathBooleanExplanationReason::EmptyInput
        );

        let mut sq = create_path();
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

        let empty = create_path();
        let result = explain_simplify_path(&kernel, &empty, None);
        assert!(result.is_some());
        assert_eq!(
            result.unwrap().reason,
            PathBooleanExplanationReason::EmptyInput
        );

        let mut triangle = create_path();
        append_path_move_to(&mut triangle, 0.0, 0.0);
        append_path_line_to(&mut triangle, 1.0, 0.0);
        append_path_line_to(&mut triangle, 0.0, 1.0);
        append_path_close(&mut triangle);

        let viable = explain_simplify_path(&kernel, &triangle, None);
        assert!(viable.is_none());
    }
}

mod get_path_boolean_explanation_operation_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_path_boolean_explanation_operation_string(PathBooleanExplanationOperation::Offset),
            "offset"
        );
        assert_eq!(
            get_path_boolean_explanation_operation_string(
                PathBooleanExplanationOperation::Simplify
            ),
            "simplify"
        );
    }
}

mod get_path_boolean_explanation_reason_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_path_boolean_explanation_reason_string(
                PathBooleanExplanationReason::CollapsedOrDegenerate
            ),
            "collapsed-or-degenerate"
        );
        assert_eq!(
            get_path_boolean_explanation_reason_string(PathBooleanExplanationReason::EmptyInput),
            "empty-input"
        );
        assert_eq!(
            get_path_boolean_explanation_reason_string(
                PathBooleanExplanationReason::NonFiniteDelta
            ),
            "non-finite-delta"
        );
    }
}

mod parse_path_boolean_explanation_operation {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_path_boolean_explanation_operation("offset"),
            Some(PathBooleanExplanationOperation::Offset)
        );
        assert_eq!(
            parse_path_boolean_explanation_operation("simplify"),
            Some(PathBooleanExplanationOperation::Simplify)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_path_boolean_explanation_operation("OFFSET"), None);
        assert_eq!(parse_path_boolean_explanation_operation(""), None);
    }
}

mod parse_path_boolean_explanation_reason {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_path_boolean_explanation_reason("collapsed-or-degenerate"),
            Some(PathBooleanExplanationReason::CollapsedOrDegenerate)
        );
        assert_eq!(
            parse_path_boolean_explanation_reason("empty-input"),
            Some(PathBooleanExplanationReason::EmptyInput)
        );
        assert_eq!(
            parse_path_boolean_explanation_reason("non-finite-delta"),
            Some(PathBooleanExplanationReason::NonFiniteDelta)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(
            parse_path_boolean_explanation_reason("COLLAPSED-OR-DEGENERATE"),
            None
        );
        assert_eq!(parse_path_boolean_explanation_reason(""), None);
    }
}
