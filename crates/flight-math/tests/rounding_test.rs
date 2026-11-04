use flight_math::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    let limit = (5e-11_f32).max(4.0 * f32::EPSILON * expected.abs().max(1.0));
    assert!(
        diff <= limit,
        "expected {expected}, got {actual} (diff: {diff}, limit: {limit})"
    );
}

mod ceil_to {
    use super::*;

    #[test]
    fn rounds_up_to_the_nearest_step() {
        assert_eq!(ceil_to(7.0, 5.0), 10.0);
    }

    #[test]
    fn leaves_an_exact_multiple_unchanged() {
        assert_eq!(ceil_to(10.0, 5.0), 10.0);
    }

    #[test]
    fn returns_value_when_step_is_0() {
        assert_eq!(ceil_to(7.0, 0.0), 7.0);
    }

    #[test]
    fn works_with_negative_values() {
        assert_eq!(ceil_to(-7.0, 5.0), -5.0);
    }
}

mod euclidean_mod {
    use super::*;

    #[test]
    fn returns_the_remainder_for_positive_inputs() {
        assert_eq!(euclidean_mod(7.0, 4.0), 3.0);
    }

    #[test]
    fn returns_a_non_negative_result_for_negative_inputs() {
        assert_eq!(euclidean_mod(-1.0, 4.0), 3.0);
        assert_eq!(euclidean_mod(-5.0, 4.0), 3.0);
    }

    #[test]
    fn returns_0_when_value_is_a_multiple_of_divisor() {
        assert_eq!(euclidean_mod(8.0, 4.0), 0.0);
    }

    #[test]
    fn throws_for_a_zero_divisor() {
        crate::assert_range_error(
            || {
                euclidean_mod(7.0, 0.0);
            },
            "euclideanMod: divisor must not be 0",
        );
    }
}

mod floor_to {
    use super::*;

    #[test]
    fn rounds_down_to_the_nearest_step() {
        assert_eq!(floor_to(7.0, 5.0), 5.0);
    }

    #[test]
    fn leaves_an_exact_multiple_unchanged() {
        assert_eq!(floor_to(10.0, 5.0), 10.0);
    }

    #[test]
    fn returns_value_when_step_is_0() {
        assert_eq!(floor_to(7.0, 0.0), 7.0);
    }

    #[test]
    fn works_with_negative_values() {
        assert_eq!(floor_to(-7.0, 5.0), -10.0);
    }
}

mod fract {
    use super::*;

    #[test]
    fn returns_the_fractional_part_of_a_positive_number() {
        // D1 f32 bound (TS: 5e-11)
        assert_approx(fract(3.75), 0.75);
    }

    #[test]
    fn returns_0_for_an_integer() {
        assert_eq!(fract(3.0), 0.0);
    }

    #[test]
    fn preserves_sign_for_negative_numbers() {
        // D1 f32 bound (TS: 5e-11)
        assert_approx(fract(-1.3), -0.3);
    }

    #[test]
    fn returns_0_for_0() {
        assert_eq!(fract(0.0), 0.0);
    }
}

mod round_to {
    use super::*;

    #[test]
    fn rounds_halfway_ties_away_from_zero_symmetrically() {
        assert_eq!(round_to(5.0, 10.0), 10.0);
        assert_eq!(round_to(-5.0, 10.0), -10.0);
        // Ensure round_to(-4, 10) does not produce negative zero
        let result = round_to(-4.0, 10.0);
        assert_eq!(result, 0.0);
        assert!(
            result.to_bits() == 0_f32.to_bits(),
            "should not be negative zero"
        );
    }

    #[test]
    fn rounds_to_the_nearest_step() {
        assert_eq!(round_to(7.0, 5.0), 5.0);
        assert_eq!(round_to(8.0, 5.0), 10.0);
    }

    #[test]
    fn leaves_an_exact_multiple_unchanged() {
        assert_eq!(round_to(10.0, 5.0), 10.0);
    }

    #[test]
    fn returns_value_when_step_is_0() {
        assert_eq!(round_to(7.0, 0.0), 7.0);
    }

    #[test]
    fn works_with_floating_point_steps() {
        // D1 f32 bound (TS: 5e-11)
        assert_approx(round_to(0.3, 0.1), 0.3);
    }

    #[test]
    fn works_with_negative_values() {
        assert_eq!(round_to(-7.0, 5.0), -5.0);
    }
}
