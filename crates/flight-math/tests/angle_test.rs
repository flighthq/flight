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

mod deg_to_rad {
    use super::*;

    #[test]
    fn converts_0_degrees_to_0_radians() {
        assert_eq!(deg_to_rad(0.0), 0.0);
    }

    #[test]
    fn converts_180_degrees_to_pi() {
        // D1 f32 bound (TS: 5e-11)
        assert_close(deg_to_rad(180.0), PI, 10);
    }

    #[test]
    fn converts_360_degrees_to_two_pi() {
        // D1 f32 bound (TS: 5e-11)
        assert_close(deg_to_rad(360.0), PI * 2.0, 10);
    }

    #[test]
    fn converts_90_degrees_to_pi_over_2() {
        // D1 f32 bound (TS: 5e-11)
        assert_close(deg_to_rad(90.0), PI / 2.0, 10);
    }

    #[test]
    fn converts_negative_degrees() {
        // D1 f32 bound (TS: 5e-11)
        assert_close(deg_to_rad(-90.0), -PI / 2.0, 10);
    }
}

mod delta_angle {
    use super::*;

    #[test]
    fn returns_0_for_identical_angles() {
        // D1 f32 bound (TS: 5e-11)
        assert_close(delta_angle(1.0, 1.0), 0.0, 10);
    }

    #[test]
    fn returns_the_shortest_arc_when_crossing_0() {
        // D1 f32 bound (TS: 5e-6)
        assert_close(delta_angle(PI - 0.1, -(PI - 0.1)), 0.2, 5);
    }

    #[test]
    fn returns_a_positive_delta_when_the_target_is_ahead() {
        // D1 f32 bound (TS: 5e-11)
        assert_close(delta_angle(0.0, PI / 2.0), PI / 2.0, 10);
    }

    #[test]
    fn returns_a_negative_delta_when_the_target_is_behind() {
        // D1 f32 bound (TS: 5e-11)
        assert_close(delta_angle(PI / 2.0, 0.0), -PI / 2.0, 10);
    }

    #[test]
    fn keeps_the_positive_half_turn_in_range() {
        assert_eq!(delta_angle(0.0, PI), PI);
    }

    #[test]
    fn result_is_always_within_range() {
        let mut i = -10;
        while i <= 10 {
            let d = delta_angle(i as f32, (i + 3) as f32);
            assert!(d > -PI);
            assert!(d <= PI);
            i += 1;
        }
    }
}

mod normalize_angle {
    use super::*;

    #[test]
    fn normalizes_0_to_0() {
        // D1 f32 bound (TS: 5e-11)
        assert_close(normalize_angle(0.0), 0.0, 10);
    }

    #[test]
    fn normalizes_pi_to_negative_pi() {
        // D1 f32 bound (TS: 5e-6)
        assert_close(normalize_angle(PI), -PI, 5);
    }

    #[test]
    fn wraps_two_pi_to_0() {
        // D1 f32 bound (TS: 5e-11)
        assert_close(normalize_angle(PI * 2.0), 0.0, 10);
    }

    #[test]
    fn wraps_values_above_pi_to_the_negative_side() {
        // D1 f32 bound (TS: 5e-11)
        assert_close(normalize_angle(PI + 1.0), -(PI - 1.0), 10);
    }

    #[test]
    fn wraps_negative_values_into_range() {
        // D1 f32 bound (TS: 5e-6)
        assert_close(normalize_angle(-PI * 3.0), -PI, 5);
    }

    #[test]
    fn result_is_always_in_range() {
        let mut i = -20;
        while i <= 20 {
            let a = normalize_angle(i as f32);
            assert!(a >= -PI);
            assert!(a < PI);
            i += 1;
        }
    }
}

mod rad_to_deg {
    use super::*;

    #[test]
    fn converts_0_radians_to_0_degrees() {
        assert_eq!(rad_to_deg(0.0), 0.0);
    }

    #[test]
    fn converts_pi_to_180_degrees() {
        // D1 f32 bound (TS: 5e-11)
        assert_close(rad_to_deg(PI), 180.0, 10);
    }

    #[test]
    fn converts_two_pi_to_360_degrees() {
        // D1 f32 bound (TS: 5e-11)
        assert_close(rad_to_deg(PI * 2.0), 360.0, 10);
    }

    #[test]
    fn is_the_inverse_of_deg_to_rad() {
        // D1 f32 bound (TS: 5e-11)
        assert_close(rad_to_deg(deg_to_rad(45.0)), 45.0, 10);
    }
}
