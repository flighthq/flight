use flight_math::*;
use std::f32::consts::PI;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod circle_kappa {
    use super::*;

    #[test]
    fn equals_four_thirds_of_the_square_root_of_two_less_one() {
        let expected = (4.0_f32 * (2.0_f32.sqrt() - 1.0)) / 3.0;
        assert_approx(CIRCLE_KAPPA, expected);
    }

    #[test]
    fn sweeps_a_unit_quarter_circle_when_used_as_the_cubic_control_distance() {
        let radius_at = |t: f32| -> f32 {
            let u = 1.0 - t;
            let x = u * u * u + 3.0 * u * u * t + 3.0 * u * t * t * CIRCLE_KAPPA;
            let y = 3.0 * u * u * t * CIRCLE_KAPPA + 3.0 * u * t * t + t * t * t;
            return (x * x + y * y).sqrt();
        };

        // The cubic bezier approximation of a quarter circle has a maximum
        // radial deviation of approximately 2.7e-4, so we use a tolerance
        // that accommodates this inherent approximation error.
        let samples = [0.0_f32, 0.25, 0.5, 0.75, 1.0];
        for t in &samples {
            let diff = (radius_at(*t) - 1.0).abs();
            assert!(diff < 3e-4, "expected radius near 1.0 at t={t}, got {} (diff: {diff})", radius_at(*t));
        }
    }
}

mod deg_to_rad_constant {
    use super::*;

    #[test]
    fn converts_180_degrees_to_pi() {
        assert_approx(180.0 * DEG_TO_RAD, PI);
    }

    #[test]
    fn converts_360_degrees_to_two_pi() {
        assert_approx(360.0 * DEG_TO_RAD, PI * 2.0);
    }
}

mod epsilon_constant {
    use super::*;

    #[test]
    fn is_a_positive_number() {
        assert!(EPSILON > 0.0);
    }

    #[test]
    fn is_smaller_than_1e_minus_5() {
        assert!(EPSILON < 1e-5);
    }
}

mod half_pi {
    use super::*;

    #[test]
    fn equals_pi_over_2() {
        assert_approx(HALF_PI, PI / 2.0);
    }
}

mod rad_to_deg_constant {
    use super::*;

    #[test]
    fn converts_pi_radians_to_180_degrees() {
        assert_approx(PI * RAD_TO_DEG, 180.0);
    }

    #[test]
    fn is_the_reciprocal_of_deg_to_rad() {
        assert_approx(RAD_TO_DEG * DEG_TO_RAD, 1.0);
    }
}

mod tau {
    use super::*;

    #[test]
    fn equals_two_pi() {
        assert_approx(TAU, PI * 2.0);
    }
}
