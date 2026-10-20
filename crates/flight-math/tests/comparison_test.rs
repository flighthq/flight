use flight_math::*;

mod approx_equal {
    use super::*;

    #[test]
    fn returns_true_for_identical_values() {
        assert!(approx_equal(1.0, 1.0, EPSILON));
    }

    #[test]
    fn returns_true_when_values_are_within_the_default_epsilon() {
        assert!(approx_equal(1.0, 1.0 + 1e-7, EPSILON));
    }

    #[test]
    fn returns_false_when_values_differ_by_more_than_the_default_epsilon() {
        assert!(!approx_equal(1.0, 1.0 + 1e-5, EPSILON));
    }

    #[test]
    fn accepts_a_custom_epsilon() {
        assert!(approx_equal(1.0, 1.1, 0.2));
        assert!(!approx_equal(1.0, 1.3, 0.2));
    }

    #[test]
    fn returns_true_for_zero_and_near_zero() {
        assert!(approx_equal(0.0, 1e-7, EPSILON));
    }

    #[test]
    fn works_with_negative_values() {
        assert!(approx_equal(-1.0, -1.0 - 1e-7, EPSILON));
    }
}

mod approx_equal_relative {
    use super::*;

    #[test]
    fn returns_true_for_identical_values() {
        assert!(approx_equal_relative(1000.0, 1000.0, EPSILON));
    }

    #[test]
    fn returns_true_for_large_values_within_relative_epsilon() {
        assert!(approx_equal_relative(1e8, 1e8 + 1.0, EPSILON));
    }

    #[test]
    fn returns_false_when_large_values_differ_beyond_relative_epsilon() {
        assert!(!approx_equal_relative(1e8, 1e8 * 2.0, EPSILON));
    }

    #[test]
    fn returns_true_for_near_zero_values_within_absolute_epsilon() {
        assert!(approx_equal_relative(0.0, 1e-7, EPSILON));
    }
}

mod approx_zero {
    use super::*;

    #[test]
    fn returns_true_for_exact_zero() {
        assert!(approx_zero(0.0, EPSILON));
    }

    #[test]
    fn returns_true_for_values_within_epsilon() {
        assert!(approx_zero(1e-7, EPSILON));
    }

    #[test]
    fn returns_false_for_values_outside_epsilon() {
        assert!(!approx_zero(1e-4, EPSILON));
    }

    #[test]
    fn accepts_a_custom_epsilon() {
        assert!(approx_zero(0.01, 0.1));
        assert!(!approx_zero(0.2, 0.1));
    }
}
