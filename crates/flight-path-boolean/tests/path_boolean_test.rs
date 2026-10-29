use flight_path_boolean::contract::*;

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

mod get_path_offset_end_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(get_path_offset_end_string(PathOffsetEnd::Butt), "butt");
        assert_eq!(get_path_offset_end_string(PathOffsetEnd::Round), "round");
        assert_eq!(get_path_offset_end_string(PathOffsetEnd::Square), "square");
    }
}

mod get_path_offset_join_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(get_path_offset_join_string(PathOffsetJoin::Bevel), "bevel");
        assert_eq!(get_path_offset_join_string(PathOffsetJoin::Miter), "miter");
        assert_eq!(get_path_offset_join_string(PathOffsetJoin::Round), "round");
        assert_eq!(
            get_path_offset_join_string(PathOffsetJoin::Square),
            "square"
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

mod parse_path_offset_end {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(parse_path_offset_end("butt"), Some(PathOffsetEnd::Butt));
        assert_eq!(parse_path_offset_end("round"), Some(PathOffsetEnd::Round));
        assert_eq!(parse_path_offset_end("square"), Some(PathOffsetEnd::Square));
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_path_offset_end("BUTT"), None);
        assert_eq!(parse_path_offset_end(""), None);
    }
}

mod parse_path_offset_join {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(parse_path_offset_join("bevel"), Some(PathOffsetJoin::Bevel));
        assert_eq!(parse_path_offset_join("miter"), Some(PathOffsetJoin::Miter));
        assert_eq!(parse_path_offset_join("round"), Some(PathOffsetJoin::Round));
        assert_eq!(
            parse_path_offset_join("square"),
            Some(PathOffsetJoin::Square)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_path_offset_join("BEVEL"), None);
        assert_eq!(parse_path_offset_join(""), None);
    }
}
