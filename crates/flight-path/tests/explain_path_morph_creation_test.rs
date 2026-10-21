use flight_path::contract::*;

mod explain_path_morph_creation {
    use super::*;

    #[test]
    fn reports_compatible_pair() {
        let start = create_path();
        let end = create_path();
        let result = explain_path_morph_creation(&start, &end);
        assert!(result.supported);
        assert_eq!(result.reason, PathMorphCreationReason::Ok);
        assert!(result.contour.is_none());
    }

    #[test]
    fn reports_winding_mismatch() {
        let start = create_path();
        let mut end = create_path();
        end.winding = PathWinding::EvenOdd;
        let result = explain_path_morph_creation(&start, &end);
        assert!(!result.supported);
        assert_eq!(result.reason, PathMorphCreationReason::WindingMismatch);
    }

    #[test]
    fn reports_contour_count_mismatch() {
        let mut start = create_path();
        append_path_move_to(&mut start, 0.0, 0.0);
        let end = create_path();
        let result = explain_path_morph_creation(&start, &end);
        assert!(!result.supported);
        assert_eq!(result.reason, PathMorphCreationReason::ContourCountMismatch);
    }

    #[test]
    fn reports_first_contour_with_different_closedness() {
        let mut start = create_path();
        append_path_move_to(&mut start, 0.0, 0.0);
        append_path_line_to(&mut start, 1.0, 0.0);
        append_path_move_to(&mut start, 10.0, 10.0);
        append_path_line_to(&mut start, 11.0, 10.0);
        append_path_close(&mut start);
        let mut end = create_path();
        append_path_move_to(&mut end, 0.0, 0.0);
        append_path_line_to(&mut end, 1.0, 0.0);
        append_path_move_to(&mut end, 10.0, 10.0);
        append_path_line_to(&mut end, 11.0, 10.0);
        let result = explain_path_morph_creation(&start, &end);
        assert!(!result.supported);
        assert_eq!(result.reason, PathMorphCreationReason::ContourClosednessMismatch);
        assert_eq!(result.contour, Some(1));
    }

    #[test]
    fn reports_contour_orientation_mismatch_for_reversed_subset() {
        let mut start = create_path();
        append_path_move_to(&mut start, 0.0, 0.0);
        append_path_line_to(&mut start, 20.0, 0.0);
        append_path_line_to(&mut start, 20.0, 20.0);
        append_path_line_to(&mut start, 0.0, 20.0);
        append_path_close(&mut start);
        append_path_move_to(&mut start, 5.0, 5.0);
        append_path_line_to(&mut start, 15.0, 5.0);
        append_path_line_to(&mut start, 15.0, 15.0);
        append_path_line_to(&mut start, 5.0, 15.0);
        append_path_close(&mut start);
        let mut end = create_path();
        append_path_move_to(&mut end, 0.0, 0.0);
        append_path_line_to(&mut end, 20.0, 0.0);
        append_path_line_to(&mut end, 20.0, 20.0);
        append_path_line_to(&mut end, 0.0, 20.0);
        append_path_close(&mut end);
        append_path_move_to(&mut end, 5.0, 5.0);
        append_path_line_to(&mut end, 5.0, 15.0);
        append_path_line_to(&mut end, 15.0, 15.0);
        append_path_line_to(&mut end, 15.0, 5.0);
        append_path_close(&mut end);
        let result = explain_path_morph_creation(&start, &end);
        assert!(!result.supported);
        assert_eq!(result.reason, PathMorphCreationReason::ContourOrientationMismatch);
        assert_eq!(result.contour, Some(1));
    }
}
