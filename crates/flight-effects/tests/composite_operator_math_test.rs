use super::*;

mod get_composite_operator_factors {
    use super::*;

    fn factors(operator: &str, source: f32, backdrop: f32) -> [f32; 2] {
        let mut out = [0.0; 2];
        get_composite_operator_factors(&mut out, operator, source, backdrop);
        return out;
    }

    #[test]
    fn gives_source_over_its_canonical_factors() {
        let actual = factors(COMPOSITE_OPERATOR_SOURCE_OVER, 0.6, 0.4);
        assert_eq!(actual[0], 1.0);
        // D1 f32 bound (TS: exact arithmetic in f64).
        assert_close(actual[1], 0.4, 0.0);
    }
    #[test]
    fn erases_by_keeping_only_the_scaled_backdrop() {
        assert_eq!(
            factors(COMPOSITE_OPERATOR_DESTINATION_OUT, 0.75, 1.0),
            [0.0, 0.25]
        );
    }
    #[test]
    fn masks_by_keeping_only_the_backdrop_scaled_by_source_alpha() {
        assert_eq!(
            factors(COMPOSITE_OPERATOR_DESTINATION_IN, 0.75, 1.0),
            [0.0, 0.75]
        );
    }
    #[test]
    fn copies_the_source_and_drops_the_backdrop() {
        assert_eq!(factors(COMPOSITE_OPERATOR_COPY, 0.3, 0.9), [1.0, 0.0]);
    }
    #[test]
    fn clears_both_contributions() {
        assert_eq!(factors(COMPOSITE_OPERATOR_CLEAR, 0.3, 0.9), [0.0, 0.0]);
    }
    #[test]
    fn xors_to_the_mutually_uncovered_regions() {
        assert_eq!(factors(COMPOSITE_OPERATOR_XOR, 0.5, 0.25), [0.75, 0.5]);
    }
    #[test]
    fn falls_through_to_source_over_for_an_unknown_operator() {
        let actual = factors("acme.custom", 0.6, 0.4);
        assert_eq!(actual[0], 1.0);
        // D1 f32 bound (TS: exact arithmetic in f64).
        assert_close(actual[1], 0.4, 0.0);
    }
    #[test]
    fn is_alias_safe_writing_into_a_supplied_out_array() {
        let mut out = [9.0, 9.0];
        get_composite_operator_factors(&mut out, COMPOSITE_OPERATOR_DESTINATION_OVER, 0.2, 0.8);
        // D1 f32 bound (TS: exact arithmetic in f64).
        assert_close(out[0], 0.2, 0.0);
        assert_eq!(out[1], 1.0);
    }
}
