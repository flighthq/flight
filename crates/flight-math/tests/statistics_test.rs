use flight_math::*;

fn assert_approx_f64(actual: f64, expected: f64) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-5,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod mean {
    use super::*;

    #[test]
    fn returns_the_arithmetic_mean() {
        assert_eq!(mean(&[1.0, 2.0, 3.0, 4.0, 5.0]), 3.0);
    }

    #[test]
    fn returns_the_single_element_for_a_one_element_array() {
        assert_eq!(mean(&[42.0]), 42.0);
    }

    #[test]
    fn returns_nan_for_an_empty_array() {
        assert!(mean(&[]).is_nan());
    }

    #[test]
    fn handles_negative_values() {
        assert_eq!(mean(&[-2.0, 0.0, 2.0]), 0.0);
    }

    #[test]
    fn does_not_overflow_when_the_finite_mean_is_representable() {
        assert_eq!(mean(&[f64::MAX, f64::MAX]), f64::MAX);
    }

    #[test]
    fn retains_a_small_term_across_cancellation() {
        assert_eq!(mean(&[1.0, f64::EPSILON / 2.0, -1.0]), f64::EPSILON / 6.0);
    }

    #[test]
    fn preserves_zero_and_non_finite_propagation() {
        assert_eq!(mean(&[0.0, 0.0]), 0.0);
        assert_eq!(mean(&[f64::INFINITY, f64::INFINITY]), f64::INFINITY);
        assert!(mean(&[f64::INFINITY, f64::NEG_INFINITY]).is_nan());
    }
}

mod median {
    use super::*;

    #[test]
    fn returns_the_middle_value_for_an_odd_length_array() {
        assert_eq!(median(&[3.0, 1.0, 2.0]), 2.0);
    }

    #[test]
    fn returns_the_average_of_the_two_middle_values_for_an_even_length_array() {
        assert_eq!(median(&[1.0, 2.0, 3.0, 4.0]), 2.5);
    }

    #[test]
    fn returns_nan_for_an_empty_array() {
        assert!(median(&[]).is_nan());
    }

    #[test]
    fn does_not_mutate_the_input() {
        let values = [5.0, 3.0, 1.0, 4.0, 2.0];
        let original = values;
        let _ = median(&values);
        assert_eq!(values, original);
    }

    #[test]
    fn does_not_overflow_when_averaging_identical_finite_middle_values() {
        assert_eq!(median(&[f64::MAX, f64::MAX]), f64::MAX);
    }

    #[test]
    fn does_not_prematurely_underflow_when_averaging_subnormal_middle_values() {
        assert_eq!(
            median(&[f64::MIN_POSITIVE * 2.0, f64::MIN_POSITIVE * 3.0]),
            f64::MIN_POSITIVE * 2.5
        );
    }

    #[test]
    fn averages_negative_and_non_finite_middle_values_without_changing_their_semantics() {
        assert_eq!(median(&[-4.0, -2.0]), -3.0);
        assert_eq!(median(&[-f64::MAX, f64::MAX]), 0.0);
        assert_eq!(median(&[f64::INFINITY, f64::INFINITY]), f64::INFINITY);
    }
}

mod standard_deviation {
    use super::*;

    #[test]
    fn returns_0_for_a_single_element_array() {
        assert_eq!(standard_deviation(&[5.0]), 0.0);
    }

    #[test]
    fn returns_nan_for_an_empty_array() {
        assert!(standard_deviation(&[]).is_nan());
    }

    #[test]
    fn computes_the_population_standard_deviation() {
        assert_approx_f64(
            standard_deviation(&[2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0]),
            2.0,
        );
    }

    #[test]
    fn returns_zero_for_identical_maximum_finite_values() {
        assert_eq!(standard_deviation(&[f64::MAX, f64::MAX]), 0.0);
    }

    #[test]
    fn handles_zero_and_preserves_non_finite_propagation() {
        assert_eq!(standard_deviation(&[0.0, 0.0]), 0.0);
        assert!(standard_deviation(&[f64::INFINITY]).is_nan());
    }
}

mod variance {
    use super::*;

    #[test]
    fn returns_0_for_a_single_element_array() {
        assert_eq!(variance(&[5.0]), 0.0);
    }

    #[test]
    fn returns_nan_for_an_empty_array() {
        assert!(variance(&[]).is_nan());
    }

    #[test]
    fn computes_the_population_variance() {
        assert_approx_f64(variance(&[2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0]), 4.0);
    }

    #[test]
    fn returns_zero_for_identical_maximum_finite_values() {
        assert_eq!(variance(&[f64::MAX, f64::MAX]), 0.0);
    }

    #[test]
    fn compensates_the_sum_of_squared_deviations() {
        assert_eq!(
            variance(&[-1.0, 1_000_000_000_000.0, 1_000_000_000_000.0]),
            2.2222222222266665e23,
        );
    }

    #[test]
    fn handles_zero_and_preserves_non_finite_propagation() {
        assert_eq!(variance(&[0.0, 0.0]), 0.0);
        assert!(variance(&[f64::INFINITY]).is_nan());
    }
}

mod weighted_average {
    use super::*;

    #[test]
    fn returns_the_weighted_average() {
        assert_approx_f64(weighted_average(&[1.0, 2.0, 3.0], &[1.0, 1.0, 1.0]), 2.0);
        assert_approx_f64(weighted_average(&[0.0, 10.0], &[1.0, 3.0]), 7.5);
    }

    #[test]
    fn returns_nan_for_an_empty_array() {
        assert!(weighted_average(&[], &[]).is_nan());
    }

    #[test]
    fn returns_nan_when_all_weights_are_0() {
        assert!(weighted_average(&[1.0, 2.0, 3.0], &[0.0, 0.0, 0.0]).is_nan());
    }

    #[test]
    fn throws_when_arrays_have_different_lengths() {
        crate::assert_range_error(
            || {
                weighted_average(&[1.0, 2.0], &[1.0]);
            },
            "weightedAverage: values and weights must have the same length",
        );
    }

    #[test]
    fn does_not_overflow_when_the_finite_weighted_average_is_representable() {
        assert_eq!(
            weighted_average(&[f64::MAX, f64::MAX], &[1.0, 1.0]),
            f64::MAX,
        );
    }

    #[test]
    fn uses_normalized_weights_in_the_weighted_product() {
        assert_eq!(weighted_average(&[2.0, 10.0], &[1.0, 3.0]), 8.0);
    }

    #[test]
    fn retains_small_weighted_terms_across_cancellation() {
        assert_eq!(
            weighted_average(
                &[
                    10_000_000_000_000_000.0,
                    -1_000_000_000_000_000.0,
                    -10_000_000_000_000_000.0
                ],
                &[2.0, 1.0, 1.0],
            ),
            2_250_000_000_000_000.0,
        );
    }

    #[test]
    fn handles_zero_values_and_cancelling_non_zero_weights() {
        assert_eq!(weighted_average(&[0.0, 0.0], &[1.0, 1.0]), 0.0);
        assert!(weighted_average(&[1.0, 2.0], &[1.0, -1.0]).is_nan());
    }

    #[test]
    fn preserves_non_finite_weighted_average_propagation() {
        assert_eq!(weighted_average(&[f64::INFINITY], &[1.0]), f64::INFINITY);
        assert!(weighted_average(&[f64::INFINITY, 1.0], &[1.0, -1.0]).is_nan());
        assert!(weighted_average(&[1.0], &[f64::INFINITY]).is_nan());
    }
}
