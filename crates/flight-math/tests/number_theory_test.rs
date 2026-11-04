use flight_math::*;

fn assert_approx_f64(actual: f64, expected: f64) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 5e-11,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod factorial {
    use super::*;

    #[test]
    fn returns_1_for_0() {
        assert_eq!(factorial(0), 1.0);
    }

    #[test]
    fn returns_1_for_1() {
        assert_eq!(factorial(1), 1.0);
    }

    #[test]
    fn computes_common_factorials() {
        assert_eq!(factorial(5), 120.0);
        assert_eq!(factorial(10), 3628800.0);
    }

    #[test]
    fn throws_for_negative_integers() {
        crate::assert_range_error(
            || {
                factorial(-1);
            },
            "factorial: n must be a non-negative integer",
        );
    }
}

mod gcd {
    use super::*;

    #[test]
    fn returns_the_gcd_of_two_positive_integers() {
        assert_eq!(gcd(12, 8), 4);
        assert_eq!(gcd(100, 75), 25);
    }

    #[test]
    fn returns_the_larger_number_when_one_is_a_multiple_of_the_other() {
        assert_eq!(gcd(6, 3), 3);
    }

    #[test]
    fn returns_1_for_coprime_numbers() {
        assert_eq!(gcd(7, 13), 1);
    }

    #[test]
    fn accepts_negative_inputs() {
        assert_eq!(gcd(-12, 8), 4);
    }

    #[test]
    fn accepts_zero_as_one_argument() {
        assert_eq!(gcd(0, 5), 5);
        assert_eq!(gcd(7, 0), 7);
    }

    #[test]
    fn throws_when_both_arguments_are_0() {
        crate::assert_range_error(
            || {
                gcd(0, 0);
            },
            "gcd: both arguments must not be 0",
        );
    }
}

mod hypot2 {
    use super::*;

    #[test]
    fn returns_x_squared_plus_y_squared() {
        assert_eq!(hypot2(3.0, 4.0), 25.0);
    }

    #[test]
    fn returns_0_for_zero_inputs() {
        assert_eq!(hypot2(0.0, 0.0), 0.0);
    }

    #[test]
    fn matches_hypot_squared() {
        let h = (5.0_f32 * 5.0 + 12.0 * 12.0).sqrt();
        assert_approx_f64(hypot2(5.0, 12.0) as f64, (h * h) as f64);
    }
}

mod is_even {
    use super::*;

    #[test]
    fn returns_true_for_even_numbers() {
        assert!(is_even(0));
        assert!(is_even(2));
        assert!(is_even(100));
    }

    #[test]
    fn returns_false_for_odd_numbers() {
        assert!(!is_even(1));
        assert!(!is_even(3));
        assert!(!is_even(99));
    }
}

mod is_odd {
    use super::*;

    #[test]
    fn returns_true_for_odd_numbers() {
        assert!(is_odd(1));
        assert!(is_odd(3));
        assert!(is_odd(99));
    }

    #[test]
    fn returns_false_for_even_numbers() {
        assert!(!is_odd(0));
        assert!(!is_odd(2));
        assert!(!is_odd(100));
    }
}

mod lcm {
    use super::*;

    #[test]
    fn returns_the_lcm_of_two_positive_integers() {
        assert_eq!(lcm(4, 6), 12);
        assert_eq!(lcm(3, 5), 15);
    }

    #[test]
    fn returns_the_larger_number_when_one_is_a_multiple_of_the_other() {
        assert_eq!(lcm(4, 8), 8);
    }

    #[test]
    fn accepts_negative_inputs() {
        assert_eq!(lcm(-4, 6), 12);
    }
}
