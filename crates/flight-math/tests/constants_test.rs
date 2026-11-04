use flight_math::*;
use std::f32::consts::PI;

fn assert_close(actual: f32, expected: f32, digits: i32) {
    let diff = (actual - expected).abs();
    let ts_bound = 0.5 * 10.0_f32.powi(-digits);
    let limit = ts_bound.max(4.0 * f32::EPSILON * expected.abs().max(1.0));
    assert!(
        diff <= limit,
        "expected {expected}, got {actual} (diff: {diff}, limit: {limit})"
    );
}

mod circle_kappa {
    use super::*;

    #[test]
    fn equals_four_thirds_of_the_square_root_of_two_less_one() {
        let expected = (4.0_f64 * (2.0_f64.sqrt() - 1.0)) / 3.0;
        let bound = 4.0 * f64::from(f32::EPSILON) * expected.abs().max(1.0);
        // D1 f32 bound (TS: 0)
        assert!((f64::from(CIRCLE_KAPPA) - expected).abs() <= bound);
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
            // D1 f32 bound (TS: 0.0005)
            assert_close(radius_at(*t), 1.0, 3);
        }
    }
}

mod deg_to_rad_constant {
    use super::*;

    #[test]
    fn converts_180_degrees_to_pi() {
        // D1 f32 bound (TS: 5e-11)
        assert_close(180.0 * DEG_TO_RAD, PI, 10);
    }

    #[test]
    fn converts_360_degrees_to_two_pi() {
        // D1 f32 bound (TS: 5e-11)
        assert_close(360.0 * DEG_TO_RAD, PI * 2.0, 10);
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
        // D1 f32 bound (TS: 5e-11)
        assert_close(HALF_PI, PI / 2.0, 10);
    }
}

mod rad_to_deg_constant {
    use super::*;

    #[test]
    fn converts_pi_radians_to_180_degrees() {
        // D1 f32 bound (TS: 5e-11)
        assert_close(PI * RAD_TO_DEG, 180.0, 10);
    }

    #[test]
    fn is_the_reciprocal_of_deg_to_rad() {
        // D1 f32 bound (TS: 5e-11)
        assert_close(RAD_TO_DEG * DEG_TO_RAD, 1.0, 10);
    }
}

mod tau {
    use super::*;

    #[test]
    fn equals_two_pi() {
        // D1 f32 bound (TS: 5e-11)
        assert_close(TAU, PI * 2.0, 10);
    }
}
