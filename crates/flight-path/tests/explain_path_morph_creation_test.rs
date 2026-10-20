use flight_path::*;

mod explain_path_morph_creation_test {
    use super::*;

    #[test]
    fn reports_supported_for_compatible_paths() {
        let mut start = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut start, 0.0, 0.0, 100.0, 100.0);
        let mut end = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut end, 50.0, 50.0, 200.0, 200.0);
        let explanation = explain_path_morph_creation(&start, &end);
        assert!(explanation.supported);
        assert_eq!(explanation.reason, PathMorphCreationReason::Ok);
        assert!(explanation.contour.is_none());
    }

    #[test]
    fn reports_unsupported_for_winding_mismatch() {
        let mut start = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut start, 0.0, 0.0, 100.0, 100.0);
        let mut end = create_path(PathWinding::EvenOdd);
        append_path_rectangle(&mut end, 0.0, 0.0, 100.0, 100.0);
        let explanation = explain_path_morph_creation(&start, &end);
        assert!(!explanation.supported);
        assert_eq!(explanation.reason, PathMorphCreationReason::WindingMismatch);
    }

    #[test]
    fn reports_contour_index_for_closedness_mismatch() {
        let mut start = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut start, 0.0, 0.0, 100.0, 100.0);
        let mut end = create_path(PathWinding::NonZero);
        append_path_move_to(&mut end, 0.0, 0.0);
        append_path_line_to(&mut end, 100.0, 0.0);
        append_path_line_to(&mut end, 100.0, 100.0);
        append_path_line_to(&mut end, 0.0, 100.0);
        let explanation = explain_path_morph_creation(&start, &end);
        assert!(!explanation.supported);
        assert_eq!(explanation.reason, PathMorphCreationReason::ContourClosednessMismatch);
        assert!(explanation.contour.is_some());
    }
}
